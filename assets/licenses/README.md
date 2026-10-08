Whiteboard dependencies

- elkjs: Eclipse Public License 2.0. Source and upstream notices: https://github.com/kieler/elkjs. The installed library is shipped as a runtime module, including its upstream license. A copy is in elkjs.txt.
- Tabler Icons: MIT. Source: https://github.com/tabler/tabler-icons. The 60 generated stroke plans retain the notice in tabler.txt. The icon package is a build-time dependency only.
- MathJax 4: Apache-2.0. Source: https://github.com/mathjax/MathJax-src. The lazy formula worker uses the production `@mathjax/src` package and its local font dependencies. The package and its license are copied with runtime modules; mathjax.txt retains the Apache notice here as well.

Forge copies this directory into the packaged application's assets. Excalifont's existing OFL notice remains in assets/fonts/excalifont/.
