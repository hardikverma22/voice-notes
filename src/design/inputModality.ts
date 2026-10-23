// Whether the last interaction was a pointer (mouse, touch, pen) or the keyboard. Loaded at
// start-up, so components that load later (the Settings dialog) know how they were opened.
let pointer = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (pointer = true), true);
  document.addEventListener('keydown', () => (pointer = false), true);
}

export function lastInputWasPointer(): boolean {
  return pointer;
}
