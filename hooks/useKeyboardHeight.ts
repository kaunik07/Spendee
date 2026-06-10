import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Returns the current keyboard height in pixels.
 * 0 when the keyboard is hidden, actual height when visible.
 * Uses `keyboardWillShow/Hide` on iOS for smooth animation sync,
 * and `keyboardDidShow/Hide` on Android.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (e) => {
      setHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setHeight(0);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  return height;
}
