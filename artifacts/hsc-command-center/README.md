# HSC 2027 Command Center

A mobile-first study planner designed for HSC students. It is a static PWA:
there are no accounts, backend, cloud sync, API calls, or third-party tracking.

## Privacy and backups

Study records are stored in IndexedDB in the current browser profile on this
device. They do not travel with the public website or sync to another device.
If browser storage is cleared or evicted, records can be lost; export JSON
backups periodically and keep them somewhere private. Imported backups are
validated before the app accepts them.

The site repository should contain only application code or its static build,
never real study records or a personal backup file.

## Syllabus and exam facts

The starting subject names are suggestions, marked provisional and editable.
No chapters, test results, or exam dates are prefilled. Add syllabus material
from a source you trust; exam dates are labeled provisional until you confirm
them. This app does not claim that user-entered information is official.

## Build and host

From the project workspace, build the app with:

```sh
BASE_PATH=./ pnpm --filter @workspace/hsc-command-center run build
```

The static site is written to `dist/public`, including a GitHub Pages 404
fallback for direct links to app sections. Vite uses a relative base path when
no hosting base is configured, so the compiled files can be served from a
GitHub Pages project path. Replit's configured `BASE_PATH` continues to control
the Replit preview route when that environment variable is set. Calendar dates
use the `Asia/Dhaka` time zone.

For offline use, open the site once while online. The service worker caches the
app shell and same-origin assets. Static hosting cannot provide reliable
background push notifications or cross-device data sync.
