import { cardRow, chip, searchField, sectionHeader, type Subagent, subagentRow, tally } from "./components.ts";
import { agentCards, bySection, type Card, ORDER, type Section } from "./model.ts";
import { type HostSection, hostSection } from "./sections.ts";

interface HeaderEntry {
  key: string;
  kind: "header";
  section: Section;
  count: number;
}

interface CardEntry extends Card {
  kind: "card";
}

interface SubagentEntry extends Subagent {
  key: string;
  kind: "child";
}

type Entry = HeaderEntry | CardEntry | SubagentEntry;

export interface ManagerPage {
  /**
   * Names the page for `page`; `sessions` is taken by the manager's own.
   */
  id: string;
  label: string;
  /**
   * Built each time the page is shown, so leaving it disposes what it built.
   */
  view: () => View;
}

export interface ManagerOptions {
  /**
   * Drawn in place of the Manager icon and title, beside the tallies: where a host puts its own tabs.
   */
  header?: View;
  /**
   * Drawn at the right end of the header row, after the tallies: where a host puts a button of its own.
   */
  trailing?: View;
  /**
   * Sections of the host's own, drawn above Needs you in this order and tallied first in the header row: sessions
   * waiting to start, say.
   */
  sections?: HostSection[];
  /**
   * Sessions it returns true for are left out of the manager: its sections, tallies, search and group chips.
   */
  exclude?: (card: Card) => boolean;
  /**
   * Pages of the host's own, tabbed after Sessions under the header row. The header and its tallies stay on every page.
   */
  pages?: ManagerPage[];
  /**
   * The page to open on, by id; Sessions when absent or unknown.
   */
  page?: string;
  /**
   * Built at the end of the sessions search row each time it's shown: where a host puts buttons of its own.
   */
  searchTrailing?: () => View;
}

const SESSIONS = "sessions";

/**
 * The whole Manager panel. Each call owns its search, group filter and folded sections.
 */
export const manager = ({
  header,
  trailing,
  sections: hosted = [],
  exclude,
  pages = [],
  page: start,
  searchTrailing,
}: ManagerOptions = {}) => {
  const [query, setQuery] = signal("");
  const [page, setPage] = signal(pages.find((item) => item.id === start)?.id ?? SESSIONS);
  // The search box is rebuilt empty on coming back to Sessions, so the query starts over with it.
  const showPage = (id: string) => {
    setQuery("");
    setPage(id);
  };
  const [groupFilter, setGroupFilter] = signal("");
  const [collapsed, setCollapsed] = signal<Section[]>(["ended"]);

  const toggleSection = (section: Section) =>
    setCollapsed(collapsed().includes(section) ? collapsed().filter((name) => name !== section) : [...collapsed(), section]);

  const kept = computed(() => (exclude ? agentCards().filter((card) => !exclude(card)) : agentCards()));

  // cmux's right-sidebar host passes no groups (still true in 0.65.2), so there the chip row disappears.
  const groupChips = computed(() => {
    const withAgents = new Set(kept().map((card) => card.groupId));
    return (data.groups() ?? []).filter((group) => withAgents.has(group.id));
  });
  const effectiveGroupFilter = computed(() =>
    groupChips().some((group) => group.id === groupFilter()) ? groupFilter() : "",
  );

  const cards = computed(() => {
    const tokens = query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    return kept()
      .filter((card) => !effectiveGroupFilter() || card.groupId === effectiveGroupFilter())
      .filter((card) => {
        const haystack = [card.title, card.searchText, card.workspaceTitle, card.group, card.folder, card.branch]
          .join(" ")
          .toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
  });

  const sections = computed(() => bySection(cards()));
  const added = hosted.map((section) => hostSection(section, query));
  const cardsShown = () => added.some(({ cards }) => cards().length > 0);

  const entries = computed((): Entry[] =>
    ORDER.flatMap((section): Entry[] => {
      const list = sections()[section];
      if (list.length === 0) {
        return [];
      }
      const header: HeaderEntry = { key: `h:${section}`, kind: "header", section, count: list.length };
      if (collapsed().includes(section)) {
        return [header];
      }
      return [
        header,
        ...list.flatMap((card): Entry[] => [
          { ...card, kind: "card" },
          ...card.subagents.map(
            (child): SubagentEntry => ({
              key: `c:${card.key}:${child.id}`,
              kind: "child",
              child,
              workspaceId: card.workspaceId,
              focusId: card.focusId,
            }),
          ),
        ]),
      ];
    }),
  );

  // ForEach builds a row once per key, and every key starts with its kind, so a row's entry never
  // changes kind and the narrowed accessor stays true.
  const row = (entry: () => Entry) => {
    switch (entry().kind) {
      case "header": {
        const header = entry as () => HeaderEntry;
        const { section } = header();
        return sectionHeader(
          section,
          () => header().count,
          () => collapsed().includes(section),
          () => toggleSection(section),
        );
      }
      case "card":
        return cardRow(entry as () => CardEntry);
      case "child":
        return subagentRow(entry as () => SubagentEntry);
    }
  };

  const sessions = () =>
    VStack({ spacing: 4 }, [
      VStack({ spacing: 8 }, [
        ForEach({ items: () => (groupChips().length ? ["chips"] : []), key: (item) => item }, () =>
          HStack({ spacing: 4 }, [
            chip("All", () => !effectiveGroupFilter(), () => setGroupFilter("")),
            ForEach({ items: groupChips, key: (group) => group.id }, (group) =>
              chip(
                () => group().name,
                () => effectiveGroupFilter() === group().id,
                () => setGroupFilter(effectiveGroupFilter() === group().id ? "" : group().id),
              ),
            ),
            Spacer(),
          ]),
        ),

        searchTrailing
          ? HStack({ spacing: 4 }, [searchField("Search sessions…", setQuery), searchTrailing()])
          : searchField("Search sessions…", setQuery),
      ]),

      VStack({ spacing: 4 }, [
        ...added.map(({ view }) => view()),
        ForEach({ items: entries, key: (entry) => entry.key }, row),
      ]),

      Text(() => {
        if (entries().length > 0) {
          return "";
        }
        if (query().trim() || effectiveGroupFilter()) {
          return cardsShown() ? "" : "No matches.";
        }
        return "No agents running in cmux.";
      })
        .font(11)
        .color("tertiary")
        .paddingHorizontal(10)
        .paddingTop(10),
    ]);

  return VStack({ spacing: 8 }, [
    HStack({ spacing: 8 }, [
      header ??
        HStack({ spacing: 6 }, [
          Image("square.grid.2x2").font(12).color("accent"),
          Text("Manager").font(13).weight("semibold"),
        ]).fixedSize(),
      Spacer({ minLength: 0 }),
      HStack(
        { spacing: 7 },
        [
          ...added.map(({ look, count }) => tally(look, count)),
          ...ORDER.filter((section) => section !== "ended").map((section) => tally(section, () => sections()[section].length)),
        ],
      ).fixedSize(),
      ...(trailing ? [trailing] : []),
    ]),

    ...(pages.length
      ? [
          HStack({ spacing: 4 }, [
            ...[{ id: SESSIONS, label: "Sessions" }, ...pages].map((tab) =>
              chip(
                tab.label,
                () => page() === tab.id,
                () => showPage(tab.id),
              ),
            ),
            Spacer({ minLength: 0 }),
          ]),
        ]
      : []),

    // Keyed by page, so leaving one disposes it and coming back builds it fresh.
    ForEach({ items: () => [page()], key: (id) => id }, (id) =>
      (pages.find((item) => item.id === id())?.view ?? sessions)(),
    ),
    Spacer(),
  ]).paddingHorizontal(6);
};
