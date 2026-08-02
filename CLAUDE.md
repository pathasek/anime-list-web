# Pravidla pro AI asistenty

Platí obsah souboru [AGENTS.md](./AGENTS.md) v kořeni tohoto projektu.
Přečti si ho a řiď se jím. Je to jediný zdroj pravdy, aby všechny nástroje
(Claude Code, Antigravity/Gemini, VS Code rozšíření) měly stejná pravidla.

Shrnutí toho nejdůležitějšího:

- Pracuj JEN uvnitř `anime-list-web/`. Nikdy nezapisuj do nadřazené `Anime_List/`.
- `public/data/*.json` generuje Excel. Needituj je ručně.
- Nesahej na `Anime list.xlsm` ani na OST přehrávač.
- Žádný `git push` ani `git commit` bez mého pokynu. Push do `main` = nasazení
  na GitHub Pages (dělá to workflow, žádný `npm run deploy` neexistuje).
- Dočasné skripty do systémové temp složky, ne do repozitáře.
