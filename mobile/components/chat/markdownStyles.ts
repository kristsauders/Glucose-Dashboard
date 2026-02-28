import { Colors } from '../../constants/colors';

const SERIF = 'TiemposText';
const MONO = 'Courier';
const BASE = 15;

// Mirrors the web .prose CSS as closely as react-native-markdown-display allows
export const assistantMarkdownStyles = {
  body: {
    color: Colors.foreground,
    fontSize: BASE,
    lineHeight: BASE * 1.6,
    fontFamily: SERIF,
  },
  paragraph: {
    marginTop: 6,
    marginBottom: 6,
  },
  strong: { fontWeight: '700' as const },
  em: { fontStyle: 'italic' as const },
  link: { color: Colors.primary, textDecorationLine: 'underline' as const },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
    paddingLeft: 12,
    marginVertical: 8,
    color: Colors.mutedForeground,
  },
  code_inline: {
    backgroundColor: Colors.muted,
    borderRadius: 4,
    fontFamily: MONO,
    fontSize: BASE * 0.875,
    color: Colors.foreground,
  },
  fence: {
    backgroundColor: Colors.muted,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  code_block: {
    backgroundColor: Colors.muted,
    borderRadius: 8,
    padding: 12,
    fontFamily: MONO,
    fontSize: BASE * 0.875,
    marginVertical: 10,
  },
  bullet_list: { marginVertical: 6, paddingLeft: 4 },
  ordered_list: { marginVertical: 6, paddingLeft: 4 },
  list_item: { marginVertical: 2 },
  bullet_list_icon: { color: Colors.foreground, marginRight: 6, lineHeight: BASE * 1.6 },
  heading1: {
    fontSize: BASE * 1.55,
    fontWeight: '700' as const,
    fontFamily: SERIF,
    color: Colors.foreground,
    marginTop: 16,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  heading2: {
    fontSize: BASE * 1.3,
    fontWeight: '700' as const,
    fontFamily: SERIF,
    color: Colors.foreground,
    marginTop: 14,
    marginBottom: 4,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '80',
  },
  heading3: {
    fontSize: BASE * 1.12,
    fontWeight: '600' as const,
    fontFamily: SERIF,
    color: Colors.foreground,
    marginTop: 12,
    marginBottom: 4,
  },
  heading4: {
    fontSize: BASE,
    fontWeight: '600' as const,
    fontFamily: SERIF,
    color: Colors.foreground,
    letterSpacing: 0.15,
    marginTop: 10,
    marginBottom: 4,
  },
  hr: {
    borderTopWidth: 1,
    borderColor: Colors.border,
    marginVertical: 14,
  },
  table: { marginVertical: 10 },
  thead: { backgroundColor: Colors.muted },
  th: {
    fontWeight: '600' as const,
    padding: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.foreground,
  },
  td: {
    padding: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.foreground,
  },
  tr: { flexDirection: 'row' as const },
};
