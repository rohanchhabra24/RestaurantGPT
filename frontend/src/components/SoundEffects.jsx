import { useEffect } from 'react';
import { useSound } from 'react-sounds';

export default function SoundEffects() {
  const { play: playClick } = useSound('ui/button_medium');
  const { play: playType } = useSound('ui/keystroke_soft');
  const { play: playSubmit } = useSound('ui/submit');

  useEffect(() => {
    const handleClick = (e) => {
      // Find closest button or link
      const target = e.target.closest('button, a, [role="button"]');
      if (target) {
        playClick();
      }
    };

    const handleKeyDown = (e) => {
      // Avoid modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        return;
      }
      const target = e.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        if (e.key === 'Enter') {
          playSubmit();
        } else {
          playType();
        }
      }
    };

    document.addEventListener('click', handleClick, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [playClick, playType, playSubmit]);

  return null;
}
