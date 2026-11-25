declare module 'jquery' {
  export default function jquery(element: HTMLElement): {
    select2(options: 'destroy' | {
      width: string;
      dropdownParent: HTMLElement;
    }): void;
    on(event: string, listener: () => void): void;
    off(event: string): void;
    trigger(event: string): void;
  };
}

declare module 'select2' {
  export default function install(window: Window, jquery: typeof import('jquery').default): void;
}
