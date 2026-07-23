# Scene Data and Third-Party Terms

OpenAirTwin source code is licensed under Apache-2.0. Scene data, map downloads,
government spatial data and other third-party assets are not automatically
covered by that software license.

## Bundled Sample Scene

The optional sample archive contains runtime source data for four Open3Dhk tiles:

- `11_SW_7A`
- `11_SW_7B`
- `11_SW_7C`
- `11_SW_7D`

The installer verifies the archive checksum before extracting `common/`,
`tiles/` and `meshes/` into the local `scene/` directory. Render caches are
rebuilt locally and are not source scene data.

The release archive includes `THIRD_PARTY_DATA.md` with the attribution shipped
with that particular dataset. Keep that metadata with any archived or
redistributed copy of the sample data.

## Open3Dhk and Government Spatial Data

OpenAirTwin can use scene data obtained from or derived from Open3Dhk, the Common
Spatial Data Infrastructure (CSDI), and the Hong Kong Lands Department. This is
third-party government spatial data and is not licensed under the repository's
Apache-2.0 software license.

When browsing, downloading, using, reproducing, redistributing, publishing or
creating derivatives of Open3Dhk/CSDI data, users are responsible for complying
with the applicable official terms. Where required, identify the Government,
CSDI, Lands Department and/or Open3Dhk as the source and acknowledge the relevant
intellectual-property ownership.

OpenAirTwin provides tooling for working with this data but makes no warranty
regarding its accuracy, completeness, availability, timeliness or suitability
for a particular purpose.

Review the official sources before use or redistribution:

- [CSDI 3D Visualisation Map API Terms](https://portal.csdi.gov.hk/csdi-webpage/apidoc/3d-visualisation-map-api)
- [Lands Department Open Data (Geospatial)](https://www.landsd.gov.hk/en/spatial-data/open-data.html)

## Radar Drone Models

The Radar Sensing asset pipeline records four normalized drone models. These
files are third-party data and are not covered by OpenAirTwin's Apache-2.0
software license:

- DJI Air 2S, DJI Mavic 3 Cine, DJI Mini 3 and DJI Mini 3 Pro, attributed to
  [aurumjuda747](https://sketchfab.com/aurumjuda747), from their respective
  [Air 2S](https://sketchfab.com/3d-models/dji-air-2s-e310c02928bd42e3ba13d1160feb091a),
  [Mavic 3 Cine](https://sketchfab.com/3d-models/mavic-3-cine-60d4a042a6eb4a1e944b1af2d4e9368b),
  [Mini 3](https://sketchfab.com/3d-models/dji-mini-3-350fcf878fb9484580dce8c5ae2aa4c1) and
  [Mini 3 Pro](https://sketchfab.com/3d-models/dji-mini-3-pro-274f2ad2731e42b793b784c9f8453677)
  listings.

The supplied files and source listings identify these models as
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The generated
manifest retains the source archive and GLB hashes, attribution, transformation
matrix, and derivative-file hashes. OpenAirTwin redistributes normalized visual
GLB files and simplified Radar PLY derivatives under the same attribution terms,
and the asset release gate records that approval.

## User Responsibilities

Before distributing a scene, generated mesh, screenshot, dataset or derivative:

1. identify every upstream data source;
2. retain required notices and attribution;
3. confirm whether redistribution and derivative use are permitted;
4. distinguish OpenAirTwin source-code licensing from data licensing;
5. record the source date, tile identifiers and transformation steps needed for
   research reproducibility.

This document summarizes project-level responsibilities and is not legal advice.
