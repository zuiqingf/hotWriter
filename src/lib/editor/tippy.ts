/**
 * 极简 tippy 实现（替代 tippy.js）
 *
 * Tiptap 的 BubbleMenu / FloatingMenu / SlashMenu 都依赖 tippy 函数做"跟随光标定位"。
 * 官方 tippy.js 体积较大（~30kb），我们只需要 floating positioning，自己实现一个轻量版。
 *
 * 接口（与官方 tippy 兼容的关键子集）：
 *   tippy(target, options) → [instance, { setProps, destroy, hide, show }]
 *
 * Options:
 *   - getReferenceClientRect(): DOMRect
 *   - appendTo(): HTMLElement
 *   - content: HTMLElement | string
 *   - showOnCreate: boolean
 *   - interactive: boolean（点击穿透，placeholder 需要）
 *   - placement: 'bottom-start' | 'top' | ...（仅简化为 bottom / top）
 */

interface TippyOptions {
  getReferenceClientRect: () => DOMRect | null;
  appendTo?: () => HTMLElement;
  content: HTMLElement | string;
  showOnCreate?: boolean;
  interactive?: boolean;
  placement?: "top" | "top-start" | "bottom" | "bottom-start";
}

export function tippy(
  _target: any,
  options: TippyOptions
): [(props: Partial<TippyOptions>) => void] {
  const host = options.appendTo?.() ?? document.body;

  const popper = document.createElement("div");
  popper.style.position = "absolute";
  popper.style.top = "0";
  popper.style.left = "0";
  popper.style.zIndex = "9999";
  popper.style.visibility = "hidden";
  popper.style.pointerEvents = options.interactive ? "auto" : "none";
  if (typeof options.content === "string") {
    popper.innerHTML = options.content;
  } else {
    popper.appendChild(options.content);
  }
  host.appendChild(popper);

  function position() {
    const rect = options.getReferenceClientRect();
    if (!rect) return;
    const popRect = popper.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    let top = 0;
    let left = rect.left + scrollX;
    if (options.placement?.startsWith("top")) {
      top = rect.top + scrollY - popRect.height - 6;
    } else {
      top = rect.bottom + scrollY + 6;
    }
    // bottom-start: 左对齐参考元素的 left
    // top / bottom: 居中
    if (!options.placement?.endsWith("-start")) {
      left = rect.left + scrollX + rect.width / 2 - popRect.width / 2;
    }
    // 不超出视口右边界
    const maxLeft = scrollX + window.innerWidth - popRect.width - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < scrollX + 4) left = scrollX + 4;

    popper.style.top = `${top}px`;
    popper.style.left = `${left}px`;
  }

  function show() {
    popper.style.visibility = "visible";
  }
  function hide() {
    popper.style.visibility = "hidden";
  }
  function destroy() {
    if (popper.parentNode) popper.parentNode.removeChild(popper);
  }

  function setProps(newOpts: Partial<TippyOptions>) {
    if (newOpts.getReferenceClientRect) {
      options.getReferenceClientRect = newOpts.getReferenceClientRect;
    }
    position();
  }

  if (options.showOnCreate) {
    position();
    show();
  }

  // 返回一个奇怪的 tuple 是为了模拟 tippy.js API：
  //   const [popup, helpers] = tippy(...); popup.setProps(...); helpers.destroy();
  // 实际 Tiptap 调用 popup[0].setProps / .destroy，所以 tuple 第一个元素要带这些方法
  const popup = Object.assign([setProps], {
    setProps,
    destroy,
    hide,
    show,
    setProps2: setProps,
  });

  return [popup as any];
}