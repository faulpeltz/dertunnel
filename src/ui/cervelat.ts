// Cervelat micro-reactive UI framework 
// (c) faulpeltz - MIT license

/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-interface,@typescript-eslint/no-explicit-any*/

export namespace CV {
    export namespace JSX {
        export interface Element { }
        export type IntrinsicElements = { [tag: string]: any; }
    }
}

export type StateFunc<S> = {
    (): S;
    (updater: (cur: S) => S | Value): void;
}

type Value = string | boolean | number | null | undefined | void;
type AttrSpec = { [name: string]: Value; text?: string };

type CompFunc<P extends object = any, S extends object = any> = (props: P, S: StateFunc<S>) => (object | null | boolean);

type RNode = {
    tag: string;
    ident?: string;
    attrs: AttrSpec;
    children: RNode[];
};

const Cvid = "_cvid";
const TextTag = "#text";

let _domRoot: HTMLElement;
let _rootComp: CompFunc;
let _state = {};
let _render_frame = 0;
let _last_state_snap = "";

export const CV = {
    createElement: (tag: string | CompFunc, attrs: AttrSpec, ...children: RNode[]): RNode | null => {
        const nodeChildren = children?.flat()
            .filter(n => isObject(n) || isString(n))
            .map(n => isString(n) ? {
                tag: TextTag,
                attrs: { text: n },
                children: []
            } : n);

        if (isString(tag)) {
            return { tag, attrs, children: nodeChildren ?? [] };
        } else {
            if (!tag) { throw new Error("Fragments are not supported") }
            const rn = tag({ ...attrs, children: nodeChildren }, stateFunc) as RNode;
            return isObject(rn) ? rn : null;
        }
    }
};

export function render<S extends object>(domRoot: HTMLElement, root: CompFunc<S, S>, initialState: S): StateFunc<S> {
    _domRoot = domRoot;
    _rootComp = root;
    _state = initialState;
    applyState();
    return stateFunc;
}

function stateFunc<S extends object>(updater?: (cur: S) => S | Value): void | S {
    if (updater) {
        const result = updater(_state as S);
        _state = isObject(result) ? result : _state;
        const snapAfter = JSON.stringify(_state);
        if (snapAfter !== _last_state_snap) {
            _last_state_snap = snapAfter;
            if (_render_frame) { cancelAnimationFrame(_render_frame); }
            _render_frame = requestAnimationFrame(() => {
                applyState();
                _render_frame = 0;
            });
        }
    } else {
        return _state as S;
    }
}

function applyState(): void {
    try {
        if (!_domRoot) { return; }
        const root = _rootComp(_state, stateFunc) as RNode;
        if (root !== null) {
            renderToDom([root], _domRoot);
        } else {
            _domRoot.firstChild?.remove();
        }
    }
    catch (err) {
        /* eslint-disable no-console */
        console.error("Cervelat render error:", err);
    }
}

function renderToDom(renderNodes: RNode[], domParent: HTMLElement): void {
    if (domParent.nodeType !== Node.ELEMENT_NODE ||
        renderNodes.length === 0 && domParent.childNodes.length === 0) {
        return;
    }

    const cnt = {};
    for (const rn of renderNodes) {
        const n = cnt[rn.tag] ?? 0;
        rn.ident = `${rn.tag}${n}`;
        cnt[rn.tag] = n + 1;
    }

    const dnMap = new Map<string, Node>();
    domParent.childNodes.forEach(dn => dnMap.set(dn[Cvid] as string, dn));

    for (let i = 0; i < renderNodes.length; i++) {
        const rn = renderNodes[i] as Required<RNode>;
        let dn: Node = domParent.childNodes[i];
        if (rn.ident !== dn?.[Cvid]) {
            dn = dnMap.get(rn.ident) ??
                (rn.tag !== TextTag ?
                    document.createElement(rn.tag)
                    : document.createTextNode(rn.attrs.text ?? "")
                );
            dn[Cvid] = rn.ident;
            domParent.insertBefore(dn, domParent.childNodes[i]);
        }

        const isElement = dn.nodeType !== Node.TEXT_NODE;
        if (rn.attrs !== null) {
            if (isElement) {
                const edn = dn as Element;
                for (const k of Object.keys(rn.attrs)) {
                    if (k === "style") {
                        Object.assign(dn[k], rn.attrs[k]);
                    } else if (k.startsWith("on")) {
                        dn[k.toLowerCase()] = rn.attrs[k];
                    } else {
                        if (k === "className" || k === "value") {
                            if (rn.attrs[k] !== dn[k]) {
                                dn[k] = rn.attrs[k];
                            }
                        } else if (rn.attrs[k] !== edn.getAttribute(k)) {
                            edn.setAttribute(k, rn.attrs[k]?.toString() ?? "")
                        }
                    }
                }
            } else if (dn.textContent !== rn.attrs.text) {
                dn.textContent = rn.attrs.text ?? "";
            }
        }

        if (isElement) {
            renderToDom(rn.children, dn as HTMLElement);
        }
    }

    for (let i = domParent.childNodes.length - 1; i >= renderNodes.length; i--) {
        domParent.removeChild(domParent.childNodes[i]);
    }
}

function isString(s: unknown): s is string { return typeof s === "string"; }

function isObject(o: unknown): o is object { return o !== null && typeof o === "object"; }
