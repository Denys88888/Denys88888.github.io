import 'leaflet';

// leaflet-rotate ships no types. It augments the Leaflet instance it is
// imported alongside, so the options and methods it adds are declared here
// rather than cast at every call site — a cast would also happily hide the
// plugin failing to load, which is the one thing worth noticing.
declare module 'leaflet' {
  interface MapOptions {
    /** Enable rotation for this map. Off by default, so other maps are unaffected. */
    rotate?: boolean;
    /** Compass direction shown at the top of the screen, in degrees. */
    bearing?: number;
    /** The plugin's own on-screen compass. We drive bearing from the GPS heading. */
    rotateControl?: boolean | { closeOnZeroBearing?: boolean; position?: ControlPosition };
    /** Two-finger twist. Off: a driver adjusting the pinch zoom must not spin the map. */
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
  }

  interface Map {
    setBearing(degrees: number): this;
    getBearing(): number;
  }
}
