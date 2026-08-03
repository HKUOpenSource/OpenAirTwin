# Third-Party Notices

OpenAirTwin is distributed under the Apache License 2.0. The application uses or installs the following third-party software. The authoritative license texts distributed by each upstream project govern those components.

## Python Runtime Dependencies

| Component | Version | License | Project |
| --- | --- | --- | --- |
| NumPy | 2.2.6 | BSD-3-Clause | https://numpy.org/ |
| Sionna RT | 2.0.1 | Apache-2.0 | https://github.com/NVlabs/sionna-rt |
| Mitsuba | 3.8.0 | BSD-3-Clause | https://github.com/mitsuba-renderer/mitsuba3 |
| Dr.Jit | 1.3.1 | BSD-3-Clause | https://github.com/mitsuba-renderer/drjit |
| trimesh | 4.12.2 | MIT | https://github.com/mikedh/trimesh |
| DeepMIMO | 4.0.1 | GPL-2.0-or-later | https://github.com/DeepMIMO/DeepMIMO-python |
| defusedxml | 0.7.1 | PSF-2.0 | https://github.com/tiran/defusedxml |

DeepMIMO is an optional-domain runtime dependency installed as a separate Python package. It is retained to preserve the published DeepMIMO workflow and is not copied into the OpenAirTwin application archive. Redistributors must review its GPL terms for their distribution model.

## Browser Runtime Dependencies

| Component | License | Project |
| --- | --- | --- |
| React and React DOM | MIT | https://react.dev/ |
| Scheduler | MIT | https://github.com/facebook/react |
| Three.js | MIT | https://threejs.org/ |
| Leaflet | BSD-2-Clause | https://leafletjs.com/ |
| PROJ4JS | MIT | https://github.com/proj4js/proj4js |

The vendored Three.js license text is included at `backend/static/lib/THREE_LICENSE.txt`. Model-specific attribution and license metadata are included beside the applicable files under `backend/static/assets/`.

## Build and Test Dependencies

Development dependencies are not included in the release application archive. Their exact versions and declared licenses are recorded by the three npm lockfiles and the release audit artifacts.
