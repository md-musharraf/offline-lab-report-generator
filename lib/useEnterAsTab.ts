/**
 * useEnterAsTab – Global hook that makes Enter key behave like Tab
 * 
 * When the user presses Enter inside any input, select, or textarea (single-line),
 * focus moves to the next focusable form element. On the last element inside a
 * modal/form, it looks for and clicks the primary submit button.
 * 
 * Attach this hook once at the layout level so every page benefits automatically.
 */
import { useEffect } from 'react';

export function useEnterAsTab() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only act on Enter key
      if (e.key !== 'Enter') return;

      const target = e.target as HTMLElement;
      if (!target) return;
      // Widgets that handle Enter themselves (e.g. the command palette) opt out.
      if (target.closest('[data-enter-native]')) return;

      const tagName = target.tagName.toLowerCase();

      // Skip if target is a button (let buttons handle their own Enter)
      if (tagName === 'button') return;

      // Skip if target is a textarea with multiline content (allow Enter for new lines)
      // But we DO handle single-line textareas (rows=1 or no rows attr)
      if (tagName === 'textarea') {
        const textarea = target as HTMLTextAreaElement;
        const rows = textarea.getAttribute('rows');
        // If textarea has more than 1 row, let Enter work normally (new line)
        if (!rows || parseInt(rows) > 1) return;
      }

      // Only handle input, select, and single-row textarea
      if (tagName !== 'input' && tagName !== 'select' && tagName !== 'textarea') return;

      // Skip if input type is submit or button
      if (tagName === 'input') {
        const inputType = (target as HTMLInputElement).type.toLowerCase();
        if (inputType === 'submit' || inputType === 'button' || inputType === 'reset') return;
      }

      // Prevent default form submission
      e.preventDefault();

      // Find the closest modal or form container, or fall back to the document body
      const container =
        target.closest('[role="dialog"]') ||
        target.closest('.fixed.inset-0') ||   // Modal overlay pattern used in the app
        target.closest('form') ||
        target.closest('main') ||
        document.body;

      // Query all focusable form elements within the container
      const focusableSelectors = [
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
      ].join(', ');

      const focusable = Array.from(
        container.querySelectorAll(focusableSelectors)
      ).filter((el) => {
        // Filter out elements that are not visible
        const htmlEl = el as HTMLElement;
        const style = window.getComputedStyle(htmlEl);
        
        // Element is visible if it has physical dimensions OR is not display:none/visibility:hidden
        // Note: offsetParent is null for fixed elements, so we check bounding rect dimensions too.
        const hasDimensions = htmlEl.getBoundingClientRect().width > 0 || htmlEl.getBoundingClientRect().height > 0;
        const isStyleVisible = style.display !== 'none' && style.visibility !== 'hidden';
        
        return (htmlEl.offsetParent !== null || hasDimensions) && isStyleVisible && !htmlEl.hidden;
      }) as HTMLElement[];

      const currentIndex = focusable.indexOf(target);

      if (currentIndex > -1 && currentIndex < focusable.length - 1) {
        // Move to next focusable element
        const nextElement = focusable[currentIndex + 1];
        nextElement.focus();
        // Select text content if it's a text, number, email, tel, or password input for easy overwriting
        if (nextElement instanceof HTMLInputElement && ['text', 'number', 'email', 'tel', 'password'].includes(nextElement.type)) {
          nextElement.select();
        }
      } else if (currentIndex === focusable.length - 1) {
        // Last element: try to find and click the submit/save button
        const submitButton =
          container.querySelector('button[type="submit"]') ||
          container.querySelector('button:has(.lucide-save)') ||  // Button with Save icon
          container.querySelector('button.bg-primary:last-of-type');  // Primary action button
        
        if (submitButton && submitButton instanceof HTMLElement) {
          submitButton.click();
          submitButton.focus();
        }
      }
    }

    // Attach at the document level using capture phase for reliability
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);
}
