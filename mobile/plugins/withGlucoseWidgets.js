/**
 * Expo config plugin: withGlucoseWidgets
 *
 * On every `npx expo prebuild`, this plugin:
 *  1. Adds App Group entitlements to the main app
 *  2. Sets NSSupportsLiveActivities in the main app Info.plist
 *  3. Copies Swift/ObjC source files from ios-native/ into the generated ios/ tree
 *  4. Adds the GlucoseWidget extension target to the Xcode project
 *  5. Adds the native module files (GlucoseWidgetsModule) to the main app target
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs   = require('fs');

const APP_GROUP         = 'group.com.auders.t1dsage';
const BUNDLE_EXTENSION  = 'com.auders.t1dsage.GlucoseWidget';
const EXTENSION_NAME    = 'GlucoseWidget';
const DEPLOYMENT_TARGET = '17.0';

// Source files that belong to the widget extension target
const EXTENSION_SWIFT = [
  'GlucoseActivityAttributes.swift',
  'GlucoseWidgetViews.swift',
  'GlucoseWidgetBundle.swift',
];

// Files that go into the MAIN app target (the native module bridge)
const MAIN_MODULE_FILES = [
  'GlucoseWidgetsModule.swift',
  'GlucoseWidgetsModule.m',
];

// ── 1. App Group entitlement on main target ───────────────────────────────────
function withAppGroupEntitlement(config) {
  return withEntitlementsPlist(config, (mod) => {
    const groups = mod.modResults['com.apple.security.application-groups'] ?? [];
    if (!groups.includes(APP_GROUP)) {
      mod.modResults['com.apple.security.application-groups'] = [...groups, APP_GROUP];
    }
    return mod;
  });
}

// ── 2. NSSupportsLiveActivities in main Info.plist ────────────────────────────
function withLiveActivitiesInfoPlist(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults['NSSupportsLiveActivities'] = true;
    mod.modResults['NSSupportsLiveActivitiesFrequentUpdates'] = true;
    return mod;
  });
}

// ── 3 & 4. Copy files + add Xcode extension target ───────────────────────────
function withWidgetExtension(config) {
  return withDangerousMod(config, [
    'ios',
    async (mod) => {
      const projectRoot    = mod.modRequest.projectRoot;
      const platformRoot   = mod.modRequest.platformProjectRoot; // ios/
      const sourceRoot     = path.join(projectRoot, 'ios-native', EXTENSION_NAME);
      const extDest        = path.join(platformRoot, EXTENSION_NAME);
      const mainTargetDest = path.join(platformRoot, 'Sage');

      // Create destination dirs
      fs.mkdirSync(extDest, { recursive: true });

      // Copy extension Swift sources + Info.plist
      for (const file of [...EXTENSION_SWIFT, 'Info.plist']) {
        fs.copyFileSync(path.join(sourceRoot, file), path.join(extDest, file));
      }

      // Write the extension entitlements file
      const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>${APP_GROUP}</string>
    </array>
</dict>
</plist>
`;
      fs.writeFileSync(
        path.join(extDest, `${EXTENSION_NAME}.entitlements`),
        entitlementsContent,
      );

      // Copy native module files into the main app target (always overwrite so
      // edits in ios-native/ are picked up without needing a full prebuild).
      for (const file of MAIN_MODULE_FILES) {
        fs.copyFileSync(path.join(sourceRoot, file), path.join(mainTargetDest, file));
      }

      // Ensure bridging header imports RCTBridgeModule so Swift can see RCT types
      const bridgingHeaderPath = path.join(mainTargetDest, 'Sage-Bridging-Header.h');
      const reactImport = '#import <React/RCTBridgeModule.h>';
      if (fs.existsSync(bridgingHeaderPath)) {
        const contents = fs.readFileSync(bridgingHeaderPath, 'utf8');
        if (!contents.includes(reactImport)) {
          fs.writeFileSync(bridgingHeaderPath, contents.trimEnd() + '\n\n' + reactImport + '\n');
        }
      }

      return mod;
    },
  ]);
}

// ── 5. Add main-app native module files to the Xcode project ─────────────────
// Uses direct object manipulation instead of addSourceFile() to avoid xcode
// package bugs with null path resolution in addPluginFile/correctForPath.
function withMainModuleXcodeFiles(config) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const objects = xcodeProject.hash.project.objects;

    // Find the main app target
    const nativeTargets = objects['PBXNativeTarget'] || {};
    const mainTargetEntry = Object.entries(nativeTargets).find(
      ([, t]) =>
        t &&
        typeof t === 'object' &&
        t.productType === '"com.apple.product-type.application"',
    );
    if (!mainTargetEntry) {
      console.warn('[withGlucoseWidgets] Could not find main app target');
      return mod;
    }
    const [, mainTarget] = mainTargetEntry;

    // Find the Sources build phase for the main target
    const sourcesSection = objects['PBXSourcesBuildPhase'] || {};
    let sourcesPhase = null;
    for (const phase of mainTarget.buildPhases || []) {
      const phaseUuid = phase.value;
      if (sourcesSection[phaseUuid]) {
        sourcesPhase = sourcesSection[phaseUuid];
        break;
      }
    }
    if (!sourcesPhase) {
      console.warn('[withGlucoseWidgets] Could not find Sources build phase');
      return mod;
    }

    if (!objects['PBXBuildFile']) objects['PBXBuildFile'] = {};
    if (!objects['PBXFileReference']) objects['PBXFileReference'] = {};

    // Helper: check if fileName is already in the main target's sources build phase
    function isInMainSources(fileName) {
      for (const f of sourcesPhase.files || []) {
        const comment = f.comment || '';
        if (comment.includes(fileName)) return true;
      }
      return false;
    }

    // Helper: find existing fileRef UUID by file name
    function findFileRef(fileName) {
      const fileRefs = objects['PBXFileReference'];
      for (const [uuid, ref] of Object.entries(fileRefs)) {
        if (!ref || typeof ref !== 'object') continue;
        const p = ref.path || '';
        const bare = p.replace(/^"|"$/g, ''); // strip surrounding quotes
        if (bare === fileName || bare.endsWith('/' + fileName)) return uuid;
      }
      return null;
    }

    // ── Files that need a NEW file reference (unique to main target) ──
    const newFiles = [
      ['Sage/GlucoseWidgetsModule.swift', 'sourcecode.swift'],
      ['Sage/GlucoseWidgetsModule.m',     'sourcecode.c.objc'],
    ];

    for (const [filePath, fileType] of newFiles) {
      const fileName = filePath.split('/').pop();
      if (isInMainSources(fileName)) continue;

      // Reuse existing file ref if already present (e.g. from a previous prebuild)
      let fileRefUuid = findFileRef(fileName);
      if (!fileRefUuid) {
        fileRefUuid = xcodeProject.generateUuid();
        objects['PBXFileReference'][fileRefUuid] = {
          isa: 'PBXFileReference',
          lastKnownFileType: fileType,
          name: `"${fileName}"`,
          path: `"${filePath}"`,
          sourceTree: '"<group>"',
        };
        objects['PBXFileReference'][`${fileRefUuid}_comment`] = fileName;
      }

      const buildFileUuid = xcodeProject.generateUuid();
      const inSourcesComment = `${fileName} in Sources`;
      objects['PBXBuildFile'][buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: fileRefUuid,
        fileRef_comment: fileName,
      };
      objects['PBXBuildFile'][`${buildFileUuid}_comment`] = inSourcesComment;
      sourcesPhase.files.push({ value: buildFileUuid, comment: inSourcesComment });
      console.log(`[withGlucoseWidgets] Added ${fileName} to main app target`);
    }

    // ── GlucoseActivityAttributes.swift: already exists as an extension file ref;
    //    we only need a new PBXBuildFile entry pointing at the same ref. ──
    const attrFileName = 'GlucoseActivityAttributes.swift';
    if (!isInMainSources(attrFileName)) {
      const fileRefUuid = findFileRef(attrFileName);
      if (fileRefUuid) {
        const buildFileUuid = xcodeProject.generateUuid();
        const inSourcesComment = `${attrFileName} in Sources`;
        objects['PBXBuildFile'][buildFileUuid] = {
          isa: 'PBXBuildFile',
          fileRef: fileRefUuid,
          fileRef_comment: attrFileName,
        };
        objects['PBXBuildFile'][`${buildFileUuid}_comment`] = inSourcesComment;
        sourcesPhase.files.push({ value: buildFileUuid, comment: inSourcesComment });
        console.log(`[withGlucoseWidgets] Added ${attrFileName} to main app target`);
      } else {
        console.warn(`[withGlucoseWidgets] Could not find file ref for ${attrFileName}`);
      }
    }

    return mod;
  });
}

// ── 6. Add extension target to Xcode project ─────────────────────────────────
function withWidgetXcodeTarget(config) {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;

    // Don't double-add
    const targets = xcodeProject.pbxNativeTargetSection();
    const exists   = Object.values(targets).some(
      (t) => t && t.name === EXTENSION_NAME,
    );
    if (exists) return mod;

    // Add new target
    const newTarget = xcodeProject.addTarget(
      EXTENSION_NAME,
      'app_extension',
      EXTENSION_NAME,
      BUNDLE_EXTENSION,
    );

    // Sources build phase — paths must be relative to ios/ root (i.e. include the subdir prefix)
    const extSwiftPaths = EXTENSION_SWIFT.map((f) => `${EXTENSION_NAME}/${f}`);
    xcodeProject.addBuildPhase(
      extSwiftPaths,
      'PBXSourcesBuildPhase',
      'Sources',
      newTarget.uuid,
      null,
      EXTENSION_NAME,
    );

    // Resources build phase — leave empty; Info.plist is handled via INFOPLIST_FILE build setting
    xcodeProject.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      'Resources',
      newTarget.uuid,
      null,
      EXTENSION_NAME,
    );

    // Empty frameworks phase (WidgetKit/ActivityKit are auto-linked via Swift imports)
    xcodeProject.addBuildPhase(
      [],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      newTarget.uuid,
      null,
      EXTENSION_NAME,
    );

    // Derive the dev team from the main target's existing build settings
    let devTeam = '';
    const buildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
    Object.values(buildConfigs).forEach((bc) => {
      if (bc && bc.buildSettings && bc.buildSettings.DEVELOPMENT_TEAM && !devTeam) {
        devTeam = bc.buildSettings.DEVELOPMENT_TEAM;
      }
    });

    // Apply build settings to every config that belongs to the new target
    Object.values(buildConfigs).forEach((bc) => {
      if (!bc || !bc.buildSettings) return;
      // Identify extension configs by PRODUCT_NAME
      const prod = bc.buildSettings.PRODUCT_NAME;
      if (prod === EXTENSION_NAME || prod === `"${EXTENSION_NAME}"`) {
        bc.buildSettings.SWIFT_VERSION                 = '5.0';
        bc.buildSettings.IPHONEOS_DEPLOYMENT_TARGET    = DEPLOYMENT_TARGET;
        bc.buildSettings.PRODUCT_BUNDLE_IDENTIFIER     = BUNDLE_EXTENSION;
        bc.buildSettings.SKIP_INSTALL                  = 'YES';
        bc.buildSettings.MARKETING_VERSION             = '1.0.0';
        bc.buildSettings.CURRENT_PROJECT_VERSION       = '1';
        bc.buildSettings.GENERATE_INFOPLIST_FILE       = 'NO';
        bc.buildSettings.INFOPLIST_FILE                = `${EXTENSION_NAME}/Info.plist`;
        bc.buildSettings.CODE_SIGN_ENTITLEMENTS        =
          `${EXTENSION_NAME}/${EXTENSION_NAME}.entitlements`;
        // Automatic signing — mirrors what Expo sets on the main target
        bc.buildSettings.CODE_SIGN_STYLE               = 'Automatic';
        bc.buildSettings.CODE_SIGN_IDENTITY            = '"Apple Development"';
        if (devTeam) bc.buildSettings.DEVELOPMENT_TEAM = devTeam;
      }
    });

    return mod;
  });
}

// ── Compose ───────────────────────────────────────────────────────────────────
module.exports = function withGlucoseWidgets(config) {
  config = withAppGroupEntitlement(config);
  config = withLiveActivitiesInfoPlist(config);
  config = withWidgetExtension(config);      // copies files to ios/
  config = withMainModuleXcodeFiles(config); // adds module files to main target
  config = withWidgetXcodeTarget(config);    // adds extension target
  return config;
};
