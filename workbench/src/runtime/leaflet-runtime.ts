import type * as Leaflet from "leaflet";

// The adapter must share the Leaflet instance that owns the entry map.
const leaflet = (window as unknown as { L: typeof Leaflet }).L;

export default leaflet;
