// Web override of the tab navigator: Expo Router picks this file over
// _layout.tsx automatically when bundling for web (native untouched).
// The sidebar shell itself is mounted once at the root (app/_layout.tsx's
// AuthGuard), wrapping every authenticated route uniformly — this just
// hands through to whichever tab screen is active.
import { Slot } from 'expo-router';

export default function WebTabLayout() {
  return <Slot />;
}
