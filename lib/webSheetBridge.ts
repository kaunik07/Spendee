// On web there's no @gorhom/bottom-sheet — components that accept a
// `sheetRef: React.RefObject<BottomSheet | null>` prop and open via
// `sheetRef.current?.expand()` / `.close()` need that same call to work when
// they render a WebDrawer instead. This installs a plain object on the ref
// mimicking BottomSheet's imperative API, backed by local visibility state,
// so every existing call site keeps working unchanged — only the sheet
// component's own chrome branches on platform.
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useWebSheetBridge(sheetRef: React.RefObject<any>, setVisible: (v: boolean) => void) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    sheetRef.current = {
      expand:       () => setVisible(true),
      snapToIndex:  () => setVisible(true),
      close:        () => setVisible(false),
      collapse:     () => setVisible(false),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
