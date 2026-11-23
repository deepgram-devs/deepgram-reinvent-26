/**
 * DataGrid as a Web Component, for static sites and pages without React: <deepgram-data-grid>.
 *
 * It enhances a plain <table> you write in the page, so the rows are in the HTML: they show (and
 * get indexed) before any script runs, and the grid still reads as a table without one. When the
 * script runs, the headers sort, rows open, the agent can point at rows, and below 640px the rows
 * become cards with a Sort by select. It sorts the same way as the React DataGrid.
 *
 * Pages with no build step load the prebuilt classic script, assets/data-grid/deepgram-data-grid.js
 * (npm run build:data-grid-element), which `npx vdui-assets` copies to public/vdui/data-grid/.
 * Bundlers can import "@deepgram-devs/dg-brand-ui/data-grid-element" instead.
 *
 *   <deepgram-data-grid sort="record:asc">
 *     <table>
 *       <caption>Open cases</caption>
 *       <thead><tr>
 *         <th data-key="record">Record</th>
 *         <th data-key="name" data-primary>Name</th>
 *         <th data-key="details" data-sortable="false" data-hide-on-phone>Details</th>
 *         <th data-key="credit" data-numeric>Credit</th>
 *       </tr></thead>
 *       <tbody>
 *         <tr data-id="CASE-20418" data-href="/cases/20418">
 *           <td>CASE-20418</td><td>Maya Chen</td><td>Fiber 500</td><td data-sort="15">$15.00</td>
 *         </tr>
 *       </tbody>
 *     </table>
 *   </deepgram-data-grid>
 *
 * The element: tone ("paper" or "stage"), sort ("key:asc" or "key:desc"), pointed (row ids,
 * space-separated), openable (rows without data-href fire row-open), and sort-label, open-label,
 * empty-label for other wording. Methods: pointAt(ids), clear(). Events: sort-change and row-open
 * (cancelable; detail { id, row }).
 *
 * Headers (th): data-key, data-primary (the column that names the row), data-numeric,
 * data-sortable="false", data-hide-on-phone, data-nowrap (ids and dates that shouldn't break). Rows (tr): data-id, data-href. Cells (td): data-sort,
 * a value to sort by when the text is formatted. Status pills: <span class="dg-status"
 * data-tone="review|good|bad|done|neutral">.
 */
import { DEFAULT_STRINGS } from "../defaultStrings";
import { parseSort, sortBy, type GridSort, type SortValue } from "../data/sort";
import { DATA_GRID_CSS } from "./styles";

export { DATA_GRID_CSS };
export type { GridSort };

const STYLE_ID = "deepgram-data-grid-css";
const ARROW =
  '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

type Column = {
  th: HTMLTableCellElement;
  key: string;
  label: string;
  numeric: boolean;
  sortable: boolean;
  hideOnPhone: boolean;
  nowrap: boolean;
};

/** The <deepgram-data-grid> element's own API, for TypeScript */
export interface DataGridElement extends HTMLElement {
  /** Tint and glow the rows with these data-ids, and scroll the first into view */
  pointAt(ids: string[]): void;
  /** Unlight every row */
  clear(): void;
  /** The current sort, or null for the rows' own order. Set it to an object or "key:asc". */
  get sort(): GridSort | null;
  set sort(value: GridSort | string | null);
}

function injectStyles(doc: Document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = DATA_GRID_CSS;
  // First in <head>, so the page's own CSS wins
  doc.head.prepend(style);
}

/** Restart a CSS animation, so pointing at the same row again glows again */
function replay(el: HTMLElement) {
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
}

function dataCells(row: HTMLTableRowElement): HTMLTableCellElement[] {
  return [...row.cells].filter((cell) => !cell.classList.contains("dg-go"));
}

function createClass() {
  return class DeepgramDataGrid extends HTMLElement implements DataGridElement {
    static observedAttributes = ["sort", "pointed", "sort-label", "open-label", "empty-label", "openable"];

    #columns: Column[] = [];
    #observer = new MutationObserver(() => this.#schedule());
    #queued = false;
    #working = false;
    #connected = false;

    connectedCallback() {
      injectStyles(this.ownerDocument);
      this.addEventListener("click", this.#onClick);
      this.addEventListener("change", this.#onChange);
      // The parser may still be adding the table (a script in <head> upgrades the element first),
      // and pages may add rows later: enhance whenever the content changes
      this.#observer.observe(this, { childList: true, subtree: true });
      this.#connected = true;
      this.#enhance();
    }

    disconnectedCallback() {
      this.#observer.disconnect();
      this.removeEventListener("click", this.#onClick);
      this.removeEventListener("change", this.#onChange);
      this.#connected = false;
    }

    attributeChangedCallback(name: string, before: string | null, after: string | null) {
      if (!this.#connected || before === after) return;
      if (name === "sort") this.#work(() => this.#applySort());
      else if (name === "pointed") this.#work(() => this.#applyPointed(true));
      else this.#schedule();
    }

    get sort(): GridSort | null {
      return parseSort(this.getAttribute("sort"));
    }

    /** An object or "key:asc" text: frameworks (React 19, Vue) set the property, not the attribute */
    set sort(value: GridSort | string | null) {
      const next = typeof value === "string" ? parseSort(value) : value;
      if (next) this.setAttribute("sort", `${next.key}:${next.direction}`);
      else this.removeAttribute("sort");
    }

    pointAt(ids: string[]) {
      const next = ids.join(" ");
      if (this.getAttribute("pointed") === next) this.#work(() => this.#applyPointed(true));
      else this.setAttribute("pointed", next);
    }

    clear() {
      this.removeAttribute("pointed");
    }

    get #table(): HTMLTableElement | null {
      return this.querySelector(":scope > table");
    }

    get #rows(): HTMLTableRowElement[] {
      return [...(this.#table?.tBodies[0]?.rows ?? [])];
    }

    #string<K extends "sortBy" | "open" | "noRows">(attr: string, key: K): string {
      return this.getAttribute(attr) ?? DEFAULT_STRINGS[key];
    }

    #schedule() {
      if (this.#working || this.#queued) return;
      this.#queued = true;
      queueMicrotask(() => {
        this.#queued = false;
        if (this.#connected) this.#enhance();
      });
    }

    /** Change the DOM without hearing our own changes back from the observer */
    #work(change: () => void) {
      this.#working = true;
      try {
        change();
      } finally {
        this.#observer.takeRecords();
        this.#working = false;
      }
    }

    #enhance() {
      this.#work(() => {
        const table = this.#table;
        const head = table?.tHead?.rows[0];
        if (!table || !head) return;

        const ths = dataCells(head) as HTMLTableCellElement[];
        this.#columns = ths.map((th, i) => ({
          th,
          key: th.dataset.key || String(i),
          label: (th.querySelector(".dg-label") ?? th).textContent?.trim() ?? "",
          numeric: th.hasAttribute("data-numeric"),
          sortable: th.dataset.sortable !== "false",
          hideOnPhone: th.hasAttribute("data-hide-on-phone"),
          nowrap: th.hasAttribute("data-nowrap"),
        }));
        const primary = Math.max(0, ths.findIndex((th) => th.hasAttribute("data-primary")));

        for (const column of this.#columns) {
          const { th } = column;
          th.scope = "col";
          th.dataset.dgKey = column.key;
          if (column.sortable && !th.querySelector(".dg-sort-button")) {
            const button = this.ownerDocument.createElement("button");
            button.type = "button";
            button.className = "dg-sort-button";
            const label = this.ownerDocument.createElement("span");
            label.className = "dg-label";
            label.append(...th.childNodes);
            button.append(label);
            button.insertAdjacentHTML("beforeend", ARROW);
            th.append(button);
          }
        }

        const openable = this.hasAttribute("openable");
        let anyOpen = false;
        for (const row of this.#rows) {
          dataCells(row).forEach((td, i) => {
            const column = this.#columns[i];
            if (!column) return;
            if (!td.hasAttribute("data-label")) td.dataset.label = column.label;
            td.toggleAttribute("data-numeric", column.numeric);
            td.toggleAttribute("data-hide-on-phone", column.hideOnPhone);
            td.toggleAttribute("data-nowrap", column.nowrap);
            td.classList.toggle("dg-primary", i === primary);
          });
          const href = row.dataset.href;
          const opens = Boolean(href) || openable;
          row.classList.toggle("dg-openable", opens);
          anyOpen ||= opens;
          const cell = dataCells(row)[primary];
          if (opens && cell && !cell.querySelector(".dg-open")) {
            const own = cell.querySelector("a[href]");
            if (own) own.classList.add("dg-open");
            else {
              const control = this.ownerDocument.createElement(href ? "a" : "button");
              control.className = "dg-open";
              if (control instanceof HTMLAnchorElement) control.href = href!;
              else (control as HTMLButtonElement).type = "button";
              control.append(...cell.childNodes);
              cell.append(control);
            }
          }
          let go = [...row.cells].find((c) => c.classList.contains("dg-go"));
          if (opens && !go) {
            go = this.ownerDocument.createElement("td");
            go.className = "dg-go";
            go.setAttribute("aria-hidden", "true");
            go.textContent = "→";
            row.append(go);
          }
          if (go) go.dataset.label = this.#string("open-label", "open");
        }
        const headGo = [...head.cells].find((c) => c.classList.contains("dg-go"));
        if (anyOpen && !headGo) {
          const td = this.ownerDocument.createElement("td");
          td.className = "dg-go";
          td.setAttribute("aria-hidden", "true");
          head.append(td);
        }

        this.#renderEmpty(table);
        this.#renderSortBar(table);
        this.#applySort();
        this.#applyPointed(false);
      });
    }

    #renderEmpty(table: HTMLTableElement) {
      let note = this.querySelector<HTMLParagraphElement>(":scope > .dg-empty");
      if (this.#rows.length) {
        note?.remove();
        return;
      }
      if (!note) {
        note = this.ownerDocument.createElement("p");
        note.className = "dg-empty";
        table.after(note);
      }
      note.textContent = this.#string("empty-label", "noRows");
    }

    #renderSortBar(table: HTMLTableElement) {
      const sortable = this.#columns.filter((c) => c.sortable);
      let bar = this.querySelector<HTMLDivElement>(":scope > .dg-sortbar");
      if (!sortable.length || !this.#rows.length) {
        bar?.remove();
        return;
      }
      if (!bar) {
        bar = this.ownerDocument.createElement("div");
        bar.className = "dg-sortbar";
        const id = `dg-sort-${Math.random().toString(36).slice(2, 8)}`;
        bar.innerHTML = `<label for="${id}"></label><select id="${id}"></select>`;
        table.before(bar);
      }
      bar.querySelector("label")!.textContent = this.#string("sort-label", "sortBy");
      const select = bar.querySelector("select")!;
      select.replaceChildren(
        ...sortable.flatMap((column) =>
          (["asc", "desc"] as const).map((direction) => new Option(DEFAULT_STRINGS.sortOption(column.label, direction, column.numeric), `${column.key}:${direction}`)),
        ),
      );
    }

    #applySort() {
      const sort = this.sort;
      const index = sort ? this.#columns.findIndex((c) => c.key === sort.key) : -1;
      for (const [i, column] of this.#columns.entries()) {
        if (i === index) column.th.setAttribute("aria-sort", sort!.direction === "asc" ? "ascending" : "descending");
        else column.th.removeAttribute("aria-sort");
      }
      const select = this.querySelector<HTMLSelectElement>(":scope > .dg-sortbar select");
      if (select) {
        // No sort yet: a blank first option, so the select doesn't claim one
        select.querySelector("option[value='']")?.remove();
        if (index < 0) select.prepend(new Option("—", "", true, true));
        else select.value = `${sort!.key}:${sort!.direction}`;
      }
      const body = this.#table?.tBodies[0];
      if (!body || index < 0) return;
      const column = this.#columns[index];
      const rows = this.#rows;
      const sorted = sortBy(rows, (row) => this.#value(row, index, column.numeric), sort!.direction);
      if (sorted.every((row, i) => row === rows[i])) return;
      body.append(...sorted);
    }

    #value(row: HTMLTableRowElement, index: number, numeric: boolean): SortValue {
      const cell = dataCells(row)[index];
      if (!cell) return null;
      const raw = (cell.dataset.sort ?? cell.textContent ?? "").trim();
      if (!numeric || raw === "") return raw;
      const n = Number.parseFloat(raw.replace(/[^\d.-]/g, ""));
      return Number.isNaN(n) ? null : n;
    }

    #applyPointed(scroll: boolean) {
      const ids = (this.getAttribute("pointed") ?? "").split(/\s+/).filter(Boolean);
      let first: HTMLTableRowElement | undefined;
      for (const row of this.#rows) {
        const lit = Boolean(row.dataset.id) && ids.includes(row.dataset.id!);
        row.classList.toggle("dg-lit", lit);
        if (!lit) continue;
        if (scroll) replay(row);
        if (row.dataset.id === ids[0]) first = row;
      }
      if (scroll) first?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    #setSort(next: GridSort) {
      this.sort = next;
      this.dispatchEvent(new CustomEvent("sort-change", { detail: next, bubbles: true }));
    }

    #onChange = (event: Event) => {
      const select = event.target as HTMLElement;
      if (!(select instanceof HTMLSelectElement) || !select.closest(".dg-sortbar")) return;
      const next = parseSort(select.value);
      if (next) this.#setSort(next);
    };

    #onClick = (event: MouseEvent) => {
      const target = event.target as Element;
      const sortButton = target.closest(".dg-sort-button");
      if (sortButton && this.contains(sortButton)) {
        const key = sortButton.closest("th")?.dataset.dgKey;
        if (!key) return;
        const sort = this.sort;
        this.#setSort({ key, direction: sort?.key === key && sort.direction === "asc" ? "desc" : "asc" });
        return;
      }
      const row = target.closest<HTMLTableRowElement>("tbody tr.dg-openable");
      if (!row || !this.contains(row)) return;
      // Other controls in a cell keep their own clicks
      const hit = target.closest("a, button, input, select, textarea, label, summary");
      if (hit && !hit.classList.contains("dg-open")) return;
      const open = new CustomEvent("row-open", { detail: { id: row.dataset.id ?? null, row }, bubbles: true, cancelable: true });
      const proceed = this.dispatchEvent(open);
      if (hit instanceof HTMLAnchorElement) {
        // The link navigates by itself, unless a listener took over
        if (!proceed) event.preventDefault();
        return;
      }
      const href = row.dataset.href;
      if (!href || !proceed) return;
      if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
      else window.location.assign(href);
    };
  };
}

/** Register <deepgram-data-grid>. Safe to call twice, and on the server (it does nothing there). */
export function defineDataGridElement() {
  if (typeof window === "undefined" || !window.customElements || customElements.get("deepgram-data-grid")) return;
  customElements.define("deepgram-data-grid", createClass());
}

defineDataGridElement();
