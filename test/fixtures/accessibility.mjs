// Utilitarios de accesibilidad sintéticos para WCAG 2.1 AA

/**
 * Convierte un color hex (#fff, #ffffff) o rgb/rgba a array [r, g, b] (0-255).
 */
export function parseColor(color) {
  if (!color) return [0, 0, 0];
  const str = color.trim().toLowerCase();
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16)
      ];
    }
  }
  const rgbMatch = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }
  return [0, 0, 0];
}

/**
 * Calcula la luminancia relativa según WCAG 2.1.
 */
export function getLuminance(color) {
  const [r, g, b] = parseColor(color).map(val => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calcula la relación de contraste (contrast ratio) entre dos colores (1:1 a 21:1).
 */
export function getContrastRatio(color1, color2) {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Verifica si un elemento es enfocable por teclado.
 */
export function isFocusable(element) {
  if (!element || element.hidden || element.disabled) return false;
  if (element.attributes?.disabled !== undefined) return false;
  const tag = element.tagName?.toLowerCase();
  if (['button', 'input', 'select', 'textarea', 'a'].includes(tag)) {
    if (tag === 'a' && !element.href && !element.attributes?.href) return false;
    return true;
  }
  const tabindex = element.attributes?.tabindex ?? element.tabindex;
  return tabindex !== undefined && tabindex !== null && Number(tabindex) >= 0;
}

/**
 * Obtiene todos los elementos enfocables dentro de un contenedor en orden DOM.
 */
export function getFocusableElements(container) {
  const elements = [];
  function traverse(node) {
    if (!node || node.hidden) return;
    if (isFocusable(node)) {
      elements.push(node);
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) traverse(child);
    }
  }
  traverse(container);
  return elements;
}

/**
 * Simula la navegación por teclado (Tab / Shift+Tab) sobre una lista de elementos.
 */
export class KeyboardNavigator {
  constructor(focusableElements = []) {
    this.elements = focusableElements.filter(el => isFocusable(el));
    this.currentIndex = -1;
  }

  tab() {
    if (this.elements.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.elements.length;
    return this.focusedElement;
  }

  shiftTab() {
    if (this.elements.length === 0) return null;
    if (this.currentIndex <= 0) {
      this.currentIndex = this.elements.length - 1;
    } else {
      this.currentIndex--;
    }
    return this.focusedElement;
  }

  get focusedElement() {
    if (this.currentIndex < 0 || this.currentIndex >= this.elements.length) return null;
    return this.elements[this.currentIndex];
  }

  pressKey(key) {
    const current = this.focusedElement;
    if (!current) return false;

    let handled = false;
    if (key === 'Enter') {
      if (typeof current.listeners?.click === 'function') {
        current.listeners.click({ type: 'click', key: 'Enter' });
        handled = true;
      } else if (typeof current.listeners?.keydown === 'function') {
        current.listeners.keydown({ type: 'keydown', key: 'Enter' });
        handled = true;
      }
    } else if (key === ' ') {
      if (typeof current.listeners?.click === 'function') {
        current.listeners.click({ type: 'click', key: ' ' });
        handled = true;
      } else if (typeof current.listeners?.keydown === 'function') {
        current.listeners.keydown({ type: 'keydown', key: ' ' });
        handled = true;
      }
    }
    return handled;
  }
}

/**
 * Analiza un CSS para verificar reglas de prefers-reduced-motion y focus-visible.
 */
export function checkAccessibilityCssRules(cssContent) {
  const hasReducedMotion = cssContent.includes('prefers-reduced-motion:reduce') ||
    cssContent.includes('prefers-reduced-motion: reduce');
  const hasFocusVisible = cssContent.includes(':focus-visible');

  return {
    hasReducedMotion,
    hasFocusVisible
  };
}

/**
 * Obtiene el nombre accesible de un elemento según WCAG.
 */
export function getAccessibleName(element) {
  if (!element) return '';
  if (element.attributes?.['aria-label']) return element.attributes['aria-label'];
  if (element.attributes?.['aria-labelledby']) return element.attributes['aria-labelledby'];
  if (element.attributes?.alt) return element.attributes.alt;
  if (element.alt) return element.alt;
  if (element.value) return element.value;
  return element.textContent?.trim() ?? '';
}
