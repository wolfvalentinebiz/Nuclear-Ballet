# Credits & Data Provenance

Nuclear Ballet is an original game. Its game code and procedural artwork are original to this project. No assets, code, or map imagery from another game are included.

## Data

- **Natural Earth** — public domain. Source: <https://www.naturalearthdata.com/>. Uses 1:50m land and lakes, 1:110m admin-0 countries, 1:10m populated places, and the 1:10m Admin-1 Gaza Strip boundary (merged into Palestine's country geometry). Natural Earth states that its map data is in the public domain and may be used for commercial purposes without attribution. This credit is provided as a courtesy. Copyright © Natural Earth contributors; no endorsement is implied.
- **IANA Time Zone Database** — public domain. Source: <https://www.iana.org/time-zones>. Accessed through the browser's `Intl` API. The country/capital timezone mapping is derived from Natural Earth's populated places layer; where a capital has no timezone field, the nearest zoned populated place is used.
- **Country population estimates** — Natural Earth `POP_EST` (public domain).
- **Outlying island-chain supplementation** — original game data. Pacific,
  Indian, Atlantic, Caribbean, polar and offshore island placements follow public
  geographic coordinates where those islands are too small for the 1:110m
  admin-0 layer; omitted islets are drawn as simplified, cartographically
  exaggerated footprints so they remain legible at the game's land-mask
  resolution. They are not Natural Earth geometry.

No satellite imagery, third-party map tiles, GPW raster, or other third-party population-density image is bundled. The population heatmap, city lights, terrain texture, starfield, sun, atmosphere, lunar surface, lunar orbit track, building symbols, and interface are generated at runtime from the data above and original code. The reference population-density map supplied during development was used only as a visual target for the legend's density classes; it is not included or redistributed.

Lunar radius (1,737.4 km) and mean Earth–Moon distance (384,400 km) are published astronomical mean values. The Moon's procedural grey surface, its orbit track, and the two-body gravity integration are original procedural content; no NASA or other lunar imagery is bundled.

## Runtime software

### three.js

MIT License — <https://threejs.org/>

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### Vite

MIT License — <https://vite.dev/>

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Build-time tooling

- **TypeScript** — Apache License 2.0, Copyright © Microsoft Corporation. Used for type checking only.
- **@types/three** — MIT License. Type definitions only.

Keep this file with any distribution of the game.
