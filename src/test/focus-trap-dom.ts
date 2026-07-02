export class FocusTrapTestElement {
  focusCount = 0;
  hiddenAncestor = false;
  listener?: (event: KeyboardEvent) => void;

  constructor(private readonly focusables: FocusTrapTestElement[] = []) {}

  focus(): void {
    this.focusCount += 1;
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      value: this,
    });
  }

  closest(selector: string): FocusTrapTestElement | null {
    return selector === "[aria-hidden='true']" && this.hiddenAncestor
      ? this
      : null;
  }

  querySelectorAll(): FocusTrapTestElement[] {
    return this.focusables;
  }

  addEventListener(type: string, listener: EventListener): void {
    if (type === "keydown") {
      this.listener = listener as (event: KeyboardEvent) => void;
    }
  }

  removeEventListener(type: string, listener: EventListener): void {
    if (type === "keydown" && this.listener === listener) {
      this.listener = undefined;
    }
  }
}

export function installFocusTrapDom(activeElement: FocusTrapTestElement) {
  const globalRef = globalThis as typeof globalThis & {
    document?: unknown;
    HTMLElement?: unknown;
  };
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalRef,
    "document",
  );
  const previousHTMLElement = Object.getOwnPropertyDescriptor(
    globalRef,
    "HTMLElement",
  );

  Object.defineProperty(globalRef, "document", {
    configurable: true,
    value: { activeElement },
  });
  Object.defineProperty(globalRef, "HTMLElement", {
    configurable: true,
    value: FocusTrapTestElement,
  });

  return () => {
    if (previousDocument) {
      Object.defineProperty(globalRef, "document", previousDocument);
    } else {
      Reflect.deleteProperty(globalRef, "document");
    }
    if (previousHTMLElement) {
      Object.defineProperty(globalRef, "HTMLElement", previousHTMLElement);
    } else {
      Reflect.deleteProperty(globalRef, "HTMLElement");
    }
  };
}
