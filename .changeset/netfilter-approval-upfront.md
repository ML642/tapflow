---
"tapflow": patch
---

`tapflow migrate net-filter` and `tapflow setup ios` now offer the approval screen **before** the install, and open it the moment macOS starts waiting for approval. The offer used to come only after the two-minute approval wait had run out, and on macOS 27 those two minutes were where people got lost: macOS's own prompt highlights OK, which closes it without approving anything, and a rerun shows no prompt at all because macOS does not ask twice about a request already waiting.

The offer is made when no tapflow extension is approved yet (a first install, a rerun over a waiting request, a reinstall after removing it), and only in an interactive terminal. It carries the same warning as before about connections dropping when the filter goes on. A yes is not asked for again after the wait, and a no is not repeated. Pressing Ctrl-C or Esc at the question stops the command with nothing installed (`setup ios` skips the step), since the question comes before anything has changed. When macOS was not expected to ask, the offer after the wait is unchanged. The activation line now tells people to choose Open System Settings rather than OK.
