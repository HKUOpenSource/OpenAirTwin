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

## User Responsibilities

Before distributing a scene, generated mesh, screenshot, dataset or derivative:

1. identify every upstream data source;
2. retain required notices and attribution;
3. confirm whether redistribution and derivative use are permitted;
4. distinguish OpenAirTwin source-code licensing from data licensing;
5. record the source date, tile identifiers and transformation steps needed for
   research reproducibility.

This document summarizes project-level responsibilities and is not legal advice.
