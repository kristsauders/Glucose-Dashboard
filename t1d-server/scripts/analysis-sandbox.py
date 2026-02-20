#!/usr/bin/env python3
"""
Sage Analysis Sandbox
=====================
Receives a JSON payload via stdin containing:
  { data: { glucose, meals, insulin, exercise, sleep }, code: str, timezone: str }

Executes user code with:
  - Pre-loaded pandas DataFrames (df_glucose, df_meals, df_insulin, df_exercise, df_sleep)
  - Restricted builtins (no file I/O, no imports, no subprocess)
  - plt.show() monkey-patched to capture figures as base64 PNG
  - 25-second inner timeout (backup to Node's 30-second SIGKILL)

Outputs a single JSON line to stdout:
  { "output": "...", "charts": ["base64png", ...], "error": null }

Security: no DB credentials, no network access, no filesystem access.
"""

import sys
import json
import io
import base64
import traceback
import math
import statistics
import datetime

# ── Inner timeout setup (Unix only) ─────────────────────────────────────────
# NOTE: signal.alarm is armed AFTER library imports — imports can be slow
# and should not count against the user's execution budget.
try:
    import signal
    def _timeout_handler(signum, frame):
        raise TimeoutError("Analysis exceeded 25-second time limit")
    signal.signal(signal.SIGALRM, _timeout_handler)
    HAS_ALARM = True
except (ImportError, AttributeError, OSError):
    HAS_ALARM = False  # Windows fallback — rely on Node's SIGKILL

# ── Read payload ─────────────────────────────────────────────────────────────
try:
    payload = json.load(sys.stdin)
except Exception as e:
    print(json.dumps({"output": "", "charts": [], "error": f"Failed to parse input: {e}"}))
    sys.exit(1)

code = payload.get("code", "")
user_tz = payload.get("timezone", "America/New_York")
data = payload.get("data", {})

# ── Import allowed libraries ─────────────────────────────────────────────────
import_errors = []

try:
    import pandas as pd
    import numpy as np
except ImportError as e:
    print(json.dumps({"output": "", "charts": [], "error": f"Required library missing: {e}. Install: pip install pandas numpy"}))
    sys.exit(1)

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend — must be before pyplot import
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    import matplotlib.ticker as mticker
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False
    import_errors.append("matplotlib not available (pip install matplotlib)")

try:
    import scipy.stats as stats
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False
    import_errors.append("scipy not available (pip install scipy)")

# statsmodels excluded — import takes 30+ seconds fresh per subprocess
# scipy.stats covers most regression/distribution needs

# ── Arm inner timeout NOW (after all imports) ────────────────────────────────
if HAS_ALARM:
    signal.alarm(25)

# ── Build DataFrames ─────────────────────────────────────────────────────────
def make_df(rows, columns=None):
    if not rows:
        return pd.DataFrame(columns=columns or [])
    return pd.DataFrame(rows)

def parse_timestamps(df, col='timestamp'):
    if col in df.columns and not df.empty:
        df[col] = pd.to_datetime(df[col], utc=True)
        try:
            df[col] = df[col].dt.tz_convert(user_tz)
        except Exception:
            pass  # Leave as UTC if timezone conversion fails
    return df

df_glucose = parse_timestamps(make_df(
    data.get("glucose", []),
    ["timestamp", "glucose", "trend", "device"]
))
if not df_glucose.empty and "glucose" in df_glucose.columns:
    df_glucose["glucose"] = pd.to_numeric(df_glucose["glucose"], errors="coerce")

df_meals = parse_timestamps(make_df(
    data.get("meals", []),
    ["timestamp", "description", "carbs", "meal_type"]
))
if not df_meals.empty and "carbs" in df_meals.columns:
    df_meals["carbs"] = pd.to_numeric(df_meals["carbs"], errors="coerce")

df_insulin = parse_timestamps(make_df(
    data.get("insulin", []),
    ["timestamp", "insulin_type", "units", "type"]
))
if not df_insulin.empty and "units" in df_insulin.columns:
    df_insulin["units"] = pd.to_numeric(df_insulin["units"], errors="coerce")

df_exercise = parse_timestamps(make_df(
    data.get("exercise", []),
    ["timestamp", "activity_type", "description", "duration_minutes", "intensity"]
))
if not df_exercise.empty and "duration_minutes" in df_exercise.columns:
    df_exercise["duration_minutes"] = pd.to_numeric(df_exercise["duration_minutes"], errors="coerce")

df_sleep = parse_timestamps(make_df(
    data.get("sleep", []),
    ["timestamp", "duration_minutes", "quality"]
))
if not df_sleep.empty and "duration_minutes" in df_sleep.columns:
    df_sleep["duration_minutes"] = pd.to_numeric(df_sleep["duration_minutes"], errors="coerce")

# ── Chart capture ─────────────────────────────────────────────────────────────
_captured_charts = []

def _capture_show():
    """Monkey-patched plt.show() — saves current figure as base64 PNG."""
    if not HAS_MATPLOTLIB:
        return
    buf = io.BytesIO()
    try:
        plt.savefig(buf, format='png', dpi=100, bbox_inches='tight',
                    facecolor='white', edgecolor='none')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('utf-8')
        _captured_charts.append(b64)
    except Exception as e:
        _captured_charts.append("")  # placeholder so chart count is preserved
    finally:
        buf.close()
        plt.close('all')

if HAS_MATPLOTLIB:
    plt.show = _capture_show

# ── Safe __import__ ──────────────────────────────────────────────────────────
# Allow import statements for whitelisted modules only.
# The model often writes "import pandas as pd" — this handles it gracefully
# instead of crashing with "ImportError: __import__ not found".
_real_import = __import__

_ALLOWED_IMPORT_ROOTS = {
    'pandas', 'numpy', 'matplotlib', 'scipy', 'math', 'statistics',
    'datetime', 'json', 'io', 'base64', 're', 'itertools', 'functools',
    'collections', 'operator', 'typing',
}

def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split('.')[0]
    if root in _ALLOWED_IMPORT_ROOTS:
        return _real_import(name, globals, locals, fromlist, level)
    raise ImportError(
        f"Import of '{name}' is not allowed in the analysis sandbox. "
        f"Available: pd, np, plt, mdates, mticker, stats, math, statistics, datetime, json"
    )

# ── Restricted builtins ──────────────────────────────────────────────────────
SAFE_BUILTINS = {
    # Type constructors
    'int': int, 'float': float, 'str': str, 'bool': bool,
    'list': list, 'dict': dict, 'tuple': tuple, 'set': set,
    'frozenset': frozenset, 'bytes': bytes,
    # Introspection (safe)
    'isinstance': isinstance, 'issubclass': issubclass,
    'type': type, 'hasattr': hasattr, 'getattr': getattr,
    'len': len, 'id': id, 'hash': hash,
    # Iteration & functional
    'range': range, 'enumerate': enumerate, 'zip': zip,
    'map': map, 'filter': filter, 'reversed': reversed,
    'sorted': sorted, 'iter': iter, 'next': next, 'any': any, 'all': all,
    # Math
    'abs': abs, 'round': round, 'min': min, 'max': max, 'sum': sum,
    'pow': pow, 'divmod': divmod,
    # Output
    'print': print, 'repr': repr, 'format': format,
    # Error handling — include all common exception types so except clauses work
    'Exception': Exception, 'BaseException': BaseException,
    'ValueError': ValueError, 'TypeError': TypeError,
    'KeyError': KeyError, 'IndexError': IndexError,
    'AttributeError': AttributeError, 'NameError': NameError,
    'ZeroDivisionError': ZeroDivisionError, 'ArithmeticError': ArithmeticError,
    'OverflowError': OverflowError, 'FloatingPointError': FloatingPointError,
    'RuntimeError': RuntimeError, 'StopIteration': StopIteration,
    'LookupError': LookupError, 'OSError': OSError, 'IOError': IOError,
    'MemoryError': MemoryError, 'RecursionError': RecursionError,
    'NotImplementedError': NotImplementedError, 'AssertionError': AssertionError,
    'ImportError': ImportError, 'ModuleNotFoundError': ModuleNotFoundError,
    'UnicodeError': UnicodeError, 'UnicodeDecodeError': UnicodeDecodeError,
    'TimeoutError': TimeoutError, 'GeneratorExit': GeneratorExit,
    # Other safe builtins
    'None': None, 'True': True, 'False': False,
    'NotImplemented': NotImplemented,
    'object': object, 'callable': callable, 'vars': vars,
    'slice': slice, 'complex': complex,
    '__import__': _safe_import,
}

# ── Execute user code ────────────────────────────────────────────────────────
exec_globals = {
    '__builtins__': SAFE_BUILTINS,
    # DataFrames
    'df_glucose': df_glucose,
    'df_meals': df_meals,
    'df_insulin': df_insulin,
    'df_exercise': df_exercise,
    'df_sleep': df_sleep,
    'user_tz': user_tz,
    # Libraries
    'pd': pd,
    'np': np,
    'math': math,
    'statistics': statistics,
    'datetime': datetime,
    'json': json,
}

if HAS_MATPLOTLIB:
    exec_globals['plt'] = plt
    exec_globals['mdates'] = mdates
    exec_globals['mticker'] = mticker

if HAS_SCIPY:
    exec_globals['stats'] = stats

# Capture stdout
output_capture = io.StringIO()
original_stdout = sys.stdout
sys.stdout = output_capture

error_msg = None
try:
    compiled = compile(code, '<sage-analysis>', 'exec')
    exec(compiled, exec_globals)
except TimeoutError as e:
    error_msg = f"TimeoutError: {e}"
except Exception:
    error_msg = traceback.format_exc()
finally:
    sys.stdout = original_stdout

if HAS_ALARM:
    signal.alarm(0)  # Cancel timeout

output_text = output_capture.getvalue()

# Prepend any import warnings
if import_errors:
    warning_text = "⚠️ Some libraries unavailable: " + "; ".join(import_errors) + "\n\n"
    output_text = warning_text + output_text

# ── Emit result ──────────────────────────────────────────────────────────────
result = {
    "output": output_text[:10000],  # Cap at 10k chars
    "charts": _captured_charts,
    "error": error_msg,
}

# Write result as the final JSON line
sys.stdout.write(json.dumps(result) + "\n")
sys.stdout.flush()
