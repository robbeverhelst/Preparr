// The logger reads LOG_LEVEL once at import time, so this must run before any test imports it
process.env.LOG_LEVEL ??= 'error'
