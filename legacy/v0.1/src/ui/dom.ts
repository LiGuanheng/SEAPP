/** 更新应用自身生成的 HTML，保留仍代表同一操作的按钮，避免打断焦点和点击。 */
export function patchHTML(container: HTMLElement, html: string): void {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(container, template.content);
}

function patchChildren(parent: Node, source: Node): void {
  const desired = Array.from(source.childNodes);
  desired.forEach((incoming, index) => {
    const current = parent.childNodes[index];
    if (!current) { parent.appendChild(incoming.cloneNode(true)); return; }
    if (current.nodeType === Node.TEXT_NODE && incoming.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== incoming.nodeValue) current.nodeValue = incoming.nodeValue;
      return;
    }
    if (current instanceof Element && incoming instanceof Element && current.tagName === incoming.tagName
      && current.getAttribute('data-action') === incoming.getAttribute('data-action')
      && current.getAttribute('data-value') === incoming.getAttribute('data-value')) {
      for (const attribute of Array.from(current.attributes)) {
        if (!incoming.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
      }
      for (const attribute of Array.from(incoming.attributes)) {
        if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
      }
      patchChildren(current, incoming);
      return;
    }
    parent.replaceChild(incoming.cloneNode(true), current);
  });
  while (parent.childNodes.length > desired.length) parent.removeChild(parent.lastChild!);
}
