/*
 * Example host sidebar · the manager with pages of the host's own.
 *
 *   Sessions   the manager's own list, with a button of the host's at the end of its search row
 *   Notes      a page of the host's, tabbed beside Sessions under the manager's header and tallies
 */

import { searchField } from "cmux-custom-manager/components";
import { manager } from "cmux-custom-manager/manager";

const NOTES = ["Ship the beta on Friday", "Rotate the staging keys"];

const notesPage = () => {
  const [query, setQuery] = signal("");
  const shown = computed(() => NOTES.filter((note) => note.toLowerCase().includes(query().trim().toLowerCase())));
  return VStack({ spacing: 8 }, [
    searchField("Search notes…", setQuery),
    VStack({ spacing: 4 }, [
      ForEach({ items: shown, key: (note) => note }, (note) =>
        Text(note).font(11).color("secondary").paddingHorizontal(10),
      ),
    ]),
  ]);
};

const docsButton = () =>
  Image("book")
    .font(11)
    .color("secondary")
    .padding(5)
    .cursor("pointer")
    .help("Docs")
    .onTap(() => cmux("browser.tab.new", { url: "https://example.com/docs" }));

sidebar(() =>
  manager({
    pages: [{ id: "notes", label: "Notes", view: notesPage }],
    searchTrailing: docsButton,
  }),
);
