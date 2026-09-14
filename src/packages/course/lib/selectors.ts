// Every selector the browser driver depends on, in one place.
//
// The EPF theme sits behind Office 365 SSO and cannot be inspected from
// outside, so these are confirmed — and adjusted — in an attended codegen
// session against a scratch course:
//
//     npx playwright codegen --load-storage <session file> https://moodle.epf.fr
//
// They deliberately favour core Moodle URLs and stable ids over theme markup:
// the activity is created through `/course/modedit.php`, not by clicking
// through the "Add an activity" chooser, because the chooser is the part a
// theme is most likely to reskin.

/**
 * A link to another page of a Moodle table, with the initials bar left out.
 *
 * Written once and used by both paged tables — the grading table and the
 * participants table — because both render the two bars the same way and a
 * walk that told them apart on one page and not the other would be worse than
 * one that did neither. What is wrong with following the letters is at
 * {@link SELECTORS.participantsPaging}.
 */
const NOT_THE_INITIALS_BAR =
  ".pagination a[href]:not(.initialbar a), .paging a[href]:not(.initialbar a)";

export const SELECTORS = {
  /** Present on any page rendered to a logged-in user. */
  loggedIn: "#page, body.userloggedin",
  /** The course page's own sections, each carrying its human name. */
  courseSection: "li.section, [data-for='section']",
  /** The activity form: name, content, submit. */
  activityName: "#id_name",
  /** With the plain text editor preference, the content field is a raw textarea. */
  activityContentTextarea:
    "#id_page_editor, textarea[name='page[text]'], #id_page",
  /** "Save and return to course" — not `#id_submitbutton`, which displays the
   * new activity instead and leaves us off the course page, where the module
   * id is read from. */
  activitySubmitAndReturn: "#id_submitbutton2",
  /** Availability, set only when creating. There is no update path for it. */
  activityVisible: "#id_visible",
  // --- the Devoir form (mod_assign), at /course/modedit.php?add=assign -----
  //
  // Core Moodle ids, like everything above: the Devoir is created through the
  // same `modedit.php` form a page is, not through the activity chooser.
  //
  // Every one of these fields is filled on a create and again on every edit,
  // at `modedit.php?update=<module id>`: an edited Deliverable is rewritten on
  // the form of the Devoir students have already handed work into, so that the
  // module id their Submissions hang off survives the edit. The one field that
  // is not typed there is `activityVisible` above, which a create writes and
  // nothing else ever does.

  /**
   * The Devoir's description — `mod_assign`'s intro, which is a different
   * field from a page's body and lives on a different form.
   *
   * With the plain text editor preference this is a raw textarea, exactly as
   * the page body is, so the stub is written as the HTML it is.
   */
  assignIntroTextarea:
    "#id_introeditor_editor, textarea[name='introeditor[text]'], #id_introeditor",
  /**
   * "Online text" and "File submissions", the two submission plugins.
   *
   * Both are set on every create, and the second is set to *off* rather than
   * left alone: a site whose default has file submissions enabled would
   * otherwise produce exactly the Devoir this design exists to prevent, and
   * "we did not switch it on" is not the same statement as "it is off".
   */
  assignOnlineText: "#id_assignsubmission_onlinetext_enabled",
  assignFileSubmissions: "#id_assignsubmission_file_enabled",
  /**
   * The due date and the cut-off date, each a checkbox that enables it and
   * five selects behind it.
   *
   * Both are set from the one Freeze. Moodle renders them in the signed-in
   * user's own timezone, which is why the driver checks that timezone before
   * it types a date into either of them: the same five numbers mean two
   * different instants in two different zones, and the difference is found out
   * by a student at a deadline.
   */
  assignDueDateEnabled: "#id_duedate_enabled",
  assignCutOffDateEnabled: "#id_cutoffdate_enabled",
  // --- counting what a Devoir holds, at /mod/assign/view.php?action=grading -
  //
  // Read before `wipe` deletes anything, through the session the driver
  // already holds rather than through a web service token. Every selector here
  // is core markup and none of it is text: a count that depended on the word
  // "Submitted" would report a French course as empty, and "empty" is the one
  // answer that leads to a delete.

  /** Any page of `mod_assign`, whatever the theme does to it. */
  assignPage: "body.path-mod-assign",
  /**
   * The grading table — core Moodle's own ids for it, set where the table is
   * constructed rather than by a theme. Its absence is not "no submissions":
   * it is a page this program did not understand, and the count aborts.
   *
   * `table#submissions` is the one that matches a live Moodle, and it is here
   * because `#mod_assign_grading` did not: core passes
   * `'mod_assign_grading-' . $contextid` to `flexible_table` as the table's
   * *unique id*, which comes out on every cell (`mod_assign_grading-1211309_r0_c0`)
   * and never on the table, while the table itself gets a plain
   * `set_attribute('id', 'submissions')`. Read off this course's Devoirs, whose
   * markup is `<table id="submissions" class="flexible table table-striped
   * table-hover generaltable generalbox">`. The two older selectors stay: they
   * cost nothing, and a Moodle that carries either is one this still reads.
   *
   * Deliberately not `table.flexible`: that is the class on every table core's
   * `flexible_table` renders anywhere in Moodle, so it would match some other
   * table on an unexpected `mod/assign` page and count its rows — nought — in
   * place of aborting. A selector that can quietly answer "empty" about the
   * wrong table is the one shape this count must not have.
   *
   * Known limitation, accepted knowingly: a Devoir with no Students enrolled
   * may render no grading table at all, and this cannot tell that apart from a
   * page it failed to read, so it aborts where it could have answered nought.
   * That makes a wipe of an empty course refuse until the Devoir is deleted by
   * hand — an annoyance, on the safe side of the trade. It stays this way
   * until the empty-state markup can be confirmed against a live Moodle:
   * guessing at it would turn a safe abort into a silent "empty", which is the
   * answer that deletes a Student's work.
   */
  assignGradingTable:
    "#mod_assign_grading, table.gradingtable, table#submissions",
  /**
   * Candidate carriers of a submission status, gathered and not judged.
   *
   * A substring match on purpose, and the widest thing here: it decides
   * nothing, it only sweeps up the class attributes that might say something.
   * What they mean is `readsAsHoldingSubmissions` in `activities.ts`, which reads
   * whole tokens and can be tested without a browser. The selector used to
   * make that judgement itself, and being a substring it counted the table's
   * own `submissionstatustable` wrapper on every row.
   */
  assignSubmissionStatus: "[class*='submissionstatus']",
  /**
   * The grading table's paging bar, followed so a count is of every page.
   *
   * The initials bar is cut out of it, for the reason {@link participantsPaging}
   * gives — it is built from the same Bootstrap `pagination` markup as the real
   * paging bar, and it filters rather than pages.
   */
  assignGradingPaging: NOT_THE_INITIALS_BAR,
  /**
   * A page of a Moodle table, and never a letter of its initials bar.
   *
   * Moodle renders "Filtrer par nom: Tout A B C …" with the same
   * `pagination`/`page-link` markup as the paging bar, so a walk that followed
   * every `.pagination a` followed twenty-six letters of first name and
   * twenty-six of surname as if they were pages. Two things went wrong at
   * once: it read the course fifty-four times over, and a letter nobody is
   * enrolled under renders no table at all — which this cannot tell from a
   * page it failed to understand, so the Probe Sheets aborted on
   * `?id=14707&tifirst=D` having read every Student already.
   *
   * Excluded by what the bar is called rather than by what its links look
   * like: `initialbar` is core's own class for it, on the element around the
   * letters, and a `tifirst=` in the href is a query parameter this program
   * would be constructing an opinion about.
   */
  participantsPaging: NOT_THE_INITIALS_BAR,
  /**
   * The participants table, at /user/index.php — core's own id for it, chosen
   * over `table.generaltable` for the reason {@link assignGradingTable} is not
   * `table.flexible`: a selector that can match some other table and answer
   * "nobody is enrolled" is a set of Probe Sheets with Students missing from
   * it, found out at an Oral.
   */
  participantsTable: "#participants",
  /**
   * The roles a participants row carries, read so that a Probe Sheet is
   * prepared for the people who sit an Oral and for nobody else.
   *
   * Core's own inline-editable hook, `data-itemtype="user_roles"`, and no
   * fallback to a column position: the identity fields a course shows are a
   * setting, so the roles cell moves left and right between courses while what
   * core calls it does not — and a `td.c3` that matched the wrong cell would
   * have a "Last access" read as a role and that Student dropped in silence. A
   * page this cannot find the roles on refuses instead, naming who.
   *
   * What the text in it *means* is decided by `enrolsAsStudent`, out where a
   * test can reach it.
   */
  participantsRoles: '[data-itemtype="user_roles"], td[data-region="roles"]',
  /** The profile form at /user/edit.php, read for the timezone and nothing else. */
  userTimezone: "#id_timezone",
  /** The section settings form at /course/editsection.php. */
  sectionName: "#id_name_value, #id_name",
  /** Some formats gate the name field behind a "Custom" checkbox. */
  sectionNameCustomise: "#id_name_customize",
  sectionSubmit: "#id_submitbutton",
  /**
   * "Tout déplier" / "Expand all", on any Moodle settings form.
   *
   * Moodle 4 renders a form as collapsed fieldsets, and the availability
   * select sits inside one of them. A control inside a collapsed fieldset is
   * in the DOM and not visible, which is not something a browser can be asked
   * to choose an option from — the first attended run against course 14707
   * spent thirty seconds discovering exactly that. Expanding the form first is
   * what makes the select actionable, and it is a click on the page's own
   * control rather than a way of reaching around the page.
   */
  formExpandAll: "a.collapseexpand, [data-toggle='collapseall']",
  /**
   * One collapsed fieldset's own toggle, on any Moodle form.
   *
   * Preferred over {@link SELECTORS.formExpandAll}, which is a *toggle*: on a
   * form Moodle already serves expanded — the grade item form is one — a
   * click on "expand all" collapses every section instead, and the field that
   * was about to be set becomes an element that is in the DOM and not
   * visible. This addresses only the sections that are actually shut, so
   * clicking it twice is the same as clicking it once.
   *
   * Scoped to `form`, which is not decoration. A Moodle page is full of
   * collapsibles that are nothing to do with the form: the nav drawer's
   * drop-downs and the message drawer's three lists are all
   * `data-toggle='collapse'` and all `aria-expanded='false'`, because the
   * drawers holding them are shut. Unscoped, this matched five of those on the
   * grade item form and none of the form's own two, and clicking an element
   * inside a closed drawer is a wait for it to become clickable that ends
   * thirty seconds later — five times, on every item read and every item
   * created. That is a `setup` that sits on the item page for minutes and
   * looks hung, because it is.
   */
  formCollapsedSection: "form [data-toggle='collapse'][aria-expanded='false']",
  /**
   * Moodle's "are you sure?" button, on the delete confirmations.
   *
   * Deleting is the one place this driver cannot address a form by id it knows
   * in advance, so the button is matched by role and by the ids core Moodle
   * has used for it. Every delete reads the course back afterwards, which is
   * what actually establishes that the right thing happened.
   */
  confirmDelete:
    "#single_button-continue, input[type='submit'][value='Yes'], " +
    "button[type='submit'][value='Yes'], form[action*='mod.php'] button[type='submit'], " +
    "form[action*='editsection.php'] button[type='submit']",
  /** The editor preference form at /user/editor.php. */
  editorPreferenceSelect: "#id_preference_htmleditor",
  editorPreferenceSubmit: "#id_submitbutton",

  // --- the rich editor, used only to get a picture into the course ---------
  //
  // A file has to be uploaded through the editor's own picker: the activity
  // form has no other way in, and there is no web service token to be had on
  // this site. So a document that shows a picture is written through Atto
  // instead of the plain textarea, and these are the controls that takes.

  /**
   * The Atto instance behind the activity's body.
   *
   * The activity form carries two rich editors — the Description above and the
   * body below — and each has its own toolbar and its own set of dialogues.
   * Every control under this heading has to be looked for inside this one, or
   * the first match on the page is the Description's: pictures then go into
   * the Description's draft area, the body's `@@PLUGINFILE@@` references
   * resolve to nothing, and students get the broken icon the read-back exists
   * to catch.
   */
  attoBodyEditor: ".editor_atto:has(#id_pageeditable)",
  /** Atto's toolbar button that opens the image dialogue. */
  attoImageButton: ".atto_image_button, button[data-plugin='image']",
  /**
   * "Browse repositories…", in the image dialogue.
   *
   * Matched on the visible one, like every dialogue control below it. Each
   * editor keeps its dialogues in the DOM whether they are open or not, so the
   * selector alone matches controls in dialogues nobody opened — and clicking
   * one of those does nothing at all.
   */
  attoBrowseRepositories: "button.openimagebrowser:visible",
  /**
   * Atto's toolbar button that swaps the rich area for the raw HTML behind it.
   *
   * The body is still written as HTML source, exactly as it is under the plain
   * text editor: Atto is here for the file picker, not to have opinions about
   * the markup the publisher renders.
   */
  attoHtmlButton: ".atto_html_button, button[data-plugin='html']",
  /** The body Atto edits: clicked to give the toolbar something to act on. */
  attoBodyEditable: "#id_pageeditable",
  /**
   * The source view Atto's HTML button opens on this site.
   *
   * Not the form's own textarea. This Moodle runs the HTML plugin with
   * CodeMirror turned on, so the raw textarea stays hidden and the source is
   * edited in an editor of its own — which is why filling the textarea failed
   * with "on the form but not showing" however carefully the button was
   * clicked.
   */
  attoSourceView: ".CodeMirror",
  /** Moodle's file picker dialogue, once something has opened it. */
  filePicker: ".file-picker:visible, .moodle-dialogue:visible .fp-repo-area",
  /** One repository in the picker's left-hand list. */
  filePickerRepository: ".fp-repo",
  /**
   * The upload pane's file input. The pane is found by looking for this rather
   * than by the repository's name, which is in whatever language this Moodle
   * is set to.
   */
  filePickerUploadInput: "input[type='file']",
  /** "Save as": the name the file is stored under, which the publisher sets. */
  filePickerSaveAs: ".fp-saveas:visible input[type='text']",
  filePickerUploadButton: ".fp-upload-btn:visible",
  /**
   * "Overwrite", on Moodle's "a file with that name already exists" dialogue.
   *
   * Reached on every re-publish, not as an edge case: opening the activity
   * form puts the files the activity already holds back into the draft area,
   * so a picture that has not changed is always uploaded over itself.
   */
  filePickerOverwrite: "button.fp-dlg-butoverwrite",
  /**
   * Any dialogue currently on screen.
   *
   * Uploading a picture opens two of them, and Atto's image dialogue stays up
   * after the picker beneath it is dismissed. An open dialogue lays a mask
   * over the toolbar, so the next picture's button is unclickable until every
   * one of them is closed.
   */
  openDialogue: ".moodle-dialogue:visible",

  // --- the gradebook, written once by `setup` -----------------------------
  //
  // Core Moodle URLs again, and core ids: `/grade/edit/scale/edit.php` and
  // `/grade/edit/tree/item.php` are the forms behind "Add a scale" and "Add
  // grade item", and going straight to them skips the gradebook's own menus,
  // which are theme surface.
  //
  // There is no selector here for the links *to* those forms. A gradebook
  // page writes some of its links relative (`edit.php?courseid=…&id=77`) and
  // some absolute, and an `[href*='/grade/edit/scale/edit.php']` matches the
  // attribute rather than where it leads, so it misses every relative one —
  // which is a course's own scales, all of them. Which links name a row is
  // decided in `gradebook.ts`, against the resolved URL, where it is tested.

  /**
   * "Standard scale", on the scale form: a scale of the whole site rather
   * than of this course.
   *
   * The scales page lists the site's standard scales beside the course's own,
   * so a site scale called `Bands` would otherwise be adopted as the one this
   * course's Grade Items are valued on — a scale nobody teaching this course
   * can correct, and one an administrator can change under it. Read on every
   * scale, and unchecked on the one this program creates.
   */
  scaleStandard: "#id_standard",
  /** The scale form: its name, and its values as one comma-separated line. */
  scaleName: "#id_name",
  scaleValues: "#id_scale",
  scaleSubmit: "#id_submitbutton",
  /**
   * One row of the gradebook setup table, carrying its Grade Item's id.
   *
   * This is how a Grade Item is found at all now: Moodle 4.5 opens the item
   * settings form in a modal, so the row's menu links nowhere and the page
   * lists every Grade Item without linking to one. The attribute is read
   * here; what it means is decided in `gradebook.ts`.
   */
  gradeItemRow: "[data-itemid]",
  /** The grade item form. */
  gradeItemName: "#id_itemname",
  /** Moodle's grade types: 1 value, 2 scale, 3 text, 0 none. */
  gradeItemType: "#id_gradetype",
  gradeItemScale: "#id_scaleid",
  /** Hidden from Students — the whole point of a Grade Item in this course. */
  gradeItemHidden: "#id_hidden",
  /**
   * "Hidden until", the date Moodle would reveal the Grade Item on.
   *
   * Read, and never set. A Grade Item hidden until a date is hidden for now
   * and readable afterwards, and "afterwards" is a Band a Student sees
   * without anyone deciding to show it — which is the same failure as a
   * visible one, arriving later. An enabled date reads as not hidden.
   */
  gradeItemHiddenUntilEnabled: "#id_hiddenuntil_enabled",
  /**
   * "Weight adjusted", and the weight beside it.
   *
   * This is how a Grade Item is kept out of the course total: Moodle has no
   * "exclude from total" switch, and an overridden weight of 0 under Natural
   * aggregation is what makes it contribute nothing. Both controls are
   * set, and both are read back — an override checked with a weight left at
   * its default is a Grade Item that still counts.
   */
  gradeItemWeightOverride: "#id_weightoverride",
  gradeItemWeight: "#id_aggregationcoef2",
  gradeItemSubmit: "#id_submitbutton",
  /**
   * "Show more…", which is what hides the availability and weight fields on
   * this form.
   *
   * Not the same control as {@link SELECTORS.formExpandAll}: that expands
   * collapsed fieldsets, and this reveals the advanced fields inside one. A
   * form can need both, so both are clicked when they are there.
   */
  formShowMore: "a.moreless-toggler, .moreless-actions",

  // --- the gradebook import, run once before the Orals --------------------
  //
  // Core Moodle again: `/grade/import/csv/index.php` is the screen a human
  // uses, in three steps — upload the file, say what its columns are, import.
  // The driver fills in the form the Instructor would fill in, which is what
  // makes doing it by hand a real fallback rather than a different procedure
  // nobody has tried.
  //
  // What is deliberately not read here is the page's prose. This site is in
  // French, so every option below is chosen by the **value** Moodle gives it —
  // `useremail`, `feedback_<id>`, `0` for ignore — and never by its label. A
  // driver that matched an English string would map nothing on this course.

  /**
   * "Choose a file", which opens the same picker a picture goes through.
   *
   * The picker is the same dialogue Atto opens; the button that opens it is
   * not. Atto wraps its control — `<div class="fp-btn-choose"><a>` — while
   * this screen's `filepicker` form element puts the class on the control
   * itself: `<input type="button" class="btn btn-secondary fp-btn-choose">`.
   * A selector written for the wrapper matches nothing here, which is what
   * stopped the import on the evening of 9 September.
   *
   * So both shapes are named, and the wrapper never is: every alternative
   * either carries the class on a control or asks for a control under it, so
   * what this resolves to is something clickable rather than a div around it.
   */
  gradeImportChooseFile:
    "input.fp-btn-choose, button.fp-btn-choose, a.fp-btn-choose, " +
    ".fp-btn-choose a, .fp-btn-choose button",
  /** What the picker shows once a file is in the form's draft area. */
  gradeImportChosenFile: ".filepicker-filename, .fp-filename",
  /** The submit button of each of the import's three forms. */
  gradeImportSubmit: "#id_submitbutton",
  /** Which column of the file names the user, and which user field it holds. */
  gradeImportMapFrom: "#id_mapfrom",
  gradeImportMapTo: "#id_mapto",
  /**
   * A problem Moodle reports about the import, in whatever language the site
   * is set to.
   *
   * Read for its text and never matched against one: what it says is quoted
   * into the abort so that a human can act on it, and the run stops because
   * the notification is there at all.
   */
  gradeImportProblem: ".alert-danger, .alert-error, .notifyproblem",

  // --- Moodle's own error page -------------------------------------------

  /**
   * Moodle's fatal error page, which is served with a 200 and looks to a
   * browser like any other page.
   *
   * Matched on `data-rel`, which core Moodle sets and no language changes, so
   * this recognises the page on a French site without reading its prose.
   */
  moodleErrorPage: "[data-rel='fatalerror'], .errorbox",
  /** What the error page says, in whatever language the site is set to. */
  moodleErrorMessage: ".errormessage",
  /**
   * The link to Moodle's docs for the error, whose last path segment is the
   * error's identifier — `invalidrecordunknown` for an activity that is not
   * there. Worth quoting: it is the part of the page a reader can search for.
   */
  moodleErrorCode: ".errorcode a[href*='/error/']",
} as const;

/**
 * The select that says what the file's column at `at` is imported as.
 *
 * A function rather than an entry in {@link SELECTORS} because the form has
 * one of these per column of the uploaded file, numbered in the file's own
 * order — which is the order the mapping is stated in, so the two cannot drift.
 */
export function gradeImportMapping(at: number): string {
  return `#id_mapping_${at}`;
}

/**
 * The option value that maps a column onto the feedback of one Grade Item.
 *
 * Moodle's own key, and the reason the mapping is done by value: on a French
 * site the option beside it reads "Rétroaction pour C1 — …", and a driver
 * matching an English label would map nothing at all.
 */
export function feedbackOptionValue(gradeItemId: string): string {
  return `feedback_${gradeItemId}`;
}

/** The option value that leaves a column out of the import. */
export const IGNORE_OPTION_VALUE = "0";

/** The option value that matches a row to a user by their email address. */
export const EMAIL_OPTION_VALUE = "useremail";

/** The host we must never be sitting on when we are about to write. */
export const MICROSOFT_LOGIN_HOST = "login.microsoftonline.com";

/** The value of the editor preference that turns the content field into raw HTML. */
export const PLAIN_TEXT_EDITOR = "textarea";

/**
 * The value of the editor preference that brings back the file picker.
 *
 * Set only while a document that shows a picture is being written, and put
 * back to {@link PLAIN_TEXT_EDITOR} straight afterwards: the plain textarea is
 * the path this program has proven against the live course, and a run should
 * not take the longer way round for the documents that do not need it.
 */
export const RICH_EDITOR = "atto";
