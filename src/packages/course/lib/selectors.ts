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
 * Moodle renders "Filtrer par nom: Tout A B C …" with the same
 * `pagination`/`page-link` markup as the paging bar, so a walk that followed
 * every `.pagination a` followed twenty-six letters of first name and
 * twenty-six of surname as if they were pages. Two things went wrong at once:
 * it read the table fifty-four times over, and a letter nobody is enrolled
 * under renders no table at all — which a walk cannot tell from a page it
 * failed to understand, so the run aborted having read every row already.
 *
 * Excluded by what the bar is called rather than by what its links look like:
 * `initialbar` is core's own class for it, on the element around the letters,
 * and a `tifirst=` in the href is a query parameter this program would be
 * constructing an opinion about.
 */
const NOT_THE_INITIALS_BAR =
  ".pagination a[href]:not(.initialbar a), .paging a[href]:not(.initialbar a)";

export const SELECTORS = {
  /** Present on any page rendered to a logged-in user. */
  loggedIn: "#page, body.userloggedin",
  /** The course page's own sections, each carrying its human name. */
  courseSection: "li.section, [data-for='section']",
  /** The activity form: name, submit. */
  activityName: "#id_name",
  /** "Save and return to course" — not `#id_submitbutton`, which displays the
   * new activity instead and leaves us off the course page, where the module
   * id is read from. */
  activitySubmitAndReturn: "#id_submitbutton2",
  /**
   * A settings form's error under one of its fields: core's `invalid-feedback`,
   * shown only when Moodle has sent the form back. Read to say *why* a save
   * did not reach the course page, instead of timing out waiting for it.
   */
  formFieldError: ".form-control-feedback.invalid-feedback",
  /** Availability, set only when creating. There is no update path for it. */
  activityVisible: "#id_visible",
  // --- the Devoir form (mod_assign), at /course/modedit.php?add=assign -----
  //
  // Core Moodle ids, like everything above: the Devoir is created through the
  // same `modedit.php` form a file resource is, not through the activity chooser.
  //
  // Every one of these fields is filled on a create and again on every edit,
  // at `modedit.php?update=<module id>`: an edited Deliverable is rewritten on
  // the form of the Devoir students have already handed work into, so that the
  // module id their Submissions hang off survives the edit. The one field that
  // is not typed there is `activityVisible` above, which a create writes and
  // nothing else ever does.

  /**
   * The Devoir's description — `mod_assign`'s intro, which is a field of
   * its own on a form of its own.
   *
   * With the plain text editor preference this is a raw textarea, so the stub
   * is written as the HTML it is.
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
  /**
   * "Remind me to grade by", which Moodle ticks on a new Devoir and dates a
   * fortnight from today. It refuses to save one earlier than the due date,
   * so it is switched off rather than left to contradict a later Freeze.
   */
  assignGradingDueDateEnabled: "#id_gradingduedate_enabled",
  // --- the file resource form (mod_resource), at /course/modedit.php?add=resource
  //
  // Recorded with codegen against course 14707 (issue #28). Name, visibility
  // and submit are the ids above; the file manager's own controls are core
  // Moodle markup, confirmed on this theme by `npm run check:file-resource`.

  /** The form's file manager: the one place the PDF goes in. */
  resourceFiles: "#fitem_id_files",
  /**
   * The file manager once it has listed what it holds. Core marks it
   * `fm-loaded` as soon as it is set up, before the listing it fetches has
   * arrived, and `fm-updating` for as long as a fetch is out, so it is the
   * two together that mean "listed". `fm-loaded` alone was read as an empty
   * manager on the attended run, and a replace kept the old file.
   */
  fileManagerIdle: ".filemanager.fm-loaded:not(.fm-updating)",
  /** "Ajouter…", which opens the file picker onto the file manager. */
  fileManagerAdd: ".fp-btn-add",
  /**
   * One file the file manager holds, in its default icon view, clicked to
   * open its own dialogue. A file manager left in another view lists nothing
   * here, and then the check that it holds only the new file stops the run.
   */
  fileManagerFile: ".fp-content .fp-file:visible",
  /** The name shown for each file the file manager holds. */
  fileManagerFileName: ".fp-content .fp-filename:visible",
  /** "Supprimer", in the dialogue a clicked file opens. */
  fileManagerDelete: ".fp-file-delete:visible",
  /**
   * "Oui", on the "are you sure?" that follows it: a core modal on this
   * site, not the file picker's own `.fp-dlg-butconfirm`, which is absent.
   */
  fileManagerConfirm: '.modal.show [data-action="save"]:visible',
  /**
   * How the resource is shown: "Ouvrir", "Intégrer", "Forcer le
   * téléchargement"… inside the collapsed "Apparence" fieldset.
   */
  resourceDisplay: "#id_display",
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
   * The initials bar is cut out of it, for the reason {@link NOT_THE_INITIALS_BAR}
   * gives — it is built from the same Bootstrap `pagination` markup as the real
   * paging bar, and it filters rather than pages.
   */
  assignGradingPaging: NOT_THE_INITIALS_BAR,
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
   * form Moodle already serves expanded, a click on "expand all" collapses
   * every section instead, and the field that
   * was about to be set becomes an element that is in the DOM and not
   * visible. This addresses only the sections that are actually shut, so
   * clicking it twice is the same as clicking it once.
   *
   * Scoped to `form`, which is not decoration. A Moodle page is full of
   * collapsibles that are nothing to do with the form: the nav drawer's
   * drop-downs and the message drawer's three lists are all
   * `data-toggle='collapse'` and all `aria-expanded='false'`, because the
   * drawers holding them are shut. Unscoped, this matched five of those on a
   * form and none of the form's own two, and clicking an element inside a
   * closed drawer is a wait for it to become clickable that ends thirty seconds
   * later — five times, on every form opened. That is a run that sits on one
   * page for minutes and looks hung, because it is.
   */
  formCollapsedSection: "form [data-toggle='collapse'][aria-expanded='false']",
  /**
   * "Show more…", which hides the advanced fields inside a fieldset.
   *
   * Not the same control as {@link SELECTORS.formExpandAll}: that expands
   * collapsed fieldsets, and this reveals the advanced fields inside one. A
   * form can need both, so both are clicked when they are there.
   */
  formShowMore: "a.moreless-toggler, .moreless-actions",
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

  // --- the file picker, the one way a file gets into this Moodle ----------
  //
  // There is no web service token to be had on this site, so a file resource's
  // PDF goes up through the picker its form's file manager opens, and these
  // are the controls that takes.

  /**
   * Moodle's file picker dialogue, once something has opened it.
   *
   * Matched on the visible one, like every dialogue control below it. Moodle
   * keeps its dialogues in the DOM whether they are open or not, so the
   * selector alone matches controls in dialogues nobody opened — and clicking
   * one of those does nothing at all.
   */
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
   * Asked only when the file manager already holds a file of that name.
   */
  filePickerOverwrite: "button.fp-dlg-butoverwrite",
  /**
   * Any dialogue currently on screen.
   *
   * An open dialogue lays a mask over the form, so the next control on it is
   * unclickable until every one of them is closed.
   */
  openDialogue: ".moodle-dialogue:visible",

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

/** The host we must never be sitting on when we are about to write. */
export const MICROSOFT_LOGIN_HOST = "login.microsoftonline.com";

/**
 * The value of the editor preference that turns a Devoir's description into
 * a raw HTML textarea.
 */
export const PLAIN_TEXT_EDITOR = "textarea";

/**
 * The value of {@link SELECTORS.resourceDisplay} that opens the file in the
 * browser: core's `RESOURCELIB_DISPLAY_OPEN`, "Ouvrir". The PDF then fills the
 * page in the browser's own viewer rather than sitting in a frame of the
 * theme's ("Intégrer", 1) or arriving as a download.
 */
export const RESOURCE_DISPLAY_OPEN = "5";
