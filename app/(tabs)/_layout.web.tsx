// Web override of the tab navigator: Expo Router picks this file over
// _layout.tsx automatically when bundling for web (native untouched). Renders
// the sidebar shell instead of the bottom <Tabs> navigator.
import { Slot } from 'expo-router';
import WebLayout from '@/components/web/WebLayout';

export default function WebTabLayout() {
  return (
    <WebLayout>
      <Slot />
    </WebLayout>
  );
}
