/**
 * Creates the MFD pre-screening Google Form with its linked response Sheet.
 *
 * How to use (one time, ~2 minutes):
 *   1. Open https://script.google.com and click "New project".
 *   2. Delete the placeholder code, paste this whole file, and save (Ctrl+S).
 *   3. Click "Run" (function createPrescreenForm). Approve the authorization
 *      prompts — the script only creates a Form and a Spreadsheet in YOUR Drive.
 *   4. Open the Execution log (View → Logs). Copy the "Candidate link" into
 *      PRESCREEN_FORM_URL in the app's .env, and bookmark the edit/sheet URLs.
 *
 * The question order matches what the MFD TAT "Record response…" parser
 * expects — if you edit questions later, keep the order intact.
 */
function createPrescreenForm() {
  const form = FormApp.create('MFD — Quick Pre-Screening (2 minutes)');

  form.setDescription(
    'Thank you for your interest! Please answer these quick questions so our recruiter ' +
      'can prepare before calling you. Your answers are stored securely by MFD and used ' +
      'only for this hiring process.'
  );
  form.setCollectEmail(false); // Q2 asks for the CV email/phone explicitly
  form.setLimitOneResponsePerUser(false); // avoid forcing a Google sign-in
  form.setConfirmationMessage('Thank you! Our recruiter will call you at your preferred time.');

  // 1. Full name
  form.addTextItem().setTitle('Your full name').setRequired(true);

  // 2. Identity key for matching the response to the candidate
  form
    .addTextItem()
    .setTitle('Your email or mobile number (same as on your CV)')
    .setHelpText('This is how we match your response — write it exactly as on your CV.')
    .setRequired(true);

  // 3. Role (one form serves all openings)
  form
    .addTextItem()
    .setTitle('Which role did you receive our email for?')
    .setHelpText("It's in the email subject, e.g. \"DBT Snowflake Engineer\".")
    .setRequired(true);

  // 4. Interest
  form
    .addMultipleChoiceItem()
    .setTitle('Are you interested in exploring this role?')
    .setChoiceValues(['Yes', 'No', 'Need more details first'])
    .setRequired(true);

  // 5. Notice period
  form
    .addMultipleChoiceItem()
    .setTitle('What is your current notice period?')
    .setChoiceValues([
      'Immediate',
      '15 days',
      '30 days',
      '60 days',
      '90 days',
      'Serving notice (last working day below)',
    ])
    .setRequired(true);

  // 6. Notice details
  form
    .addTextItem()
    .setTitle('Notice period details (if negotiable or serving notice)')
    .setHelpText('e.g. "negotiable to 30 days" or "last working day 15 Sep"');

  // 7. Current CTC
  form
    .addTextItem()
    .setTitle('Your current annual CTC')
    .setHelpText('e.g. "12 LPA" or "12 fixed + 2 variable"')
    .setRequired(true);

  // 8. Expected CTC
  form
    .addTextItem()
    .setTitle('Your expected annual CTC')
    .setHelpText('e.g. "16 LPA"')
    .setRequired(true);

  // 9. Current city
  form.addTextItem().setTitle('Which city are you currently based in?').setRequired(true);

  // 10. Location fit
  form
    .addMultipleChoiceItem()
    .setTitle('Are you comfortable with the work location / mode mentioned in the email?')
    .setChoiceValues(['Yes', 'No', 'Depends — will discuss on the call'])
    .setRequired(true);

  // 11. Current employment (recruiter cross-checks against the CV)
  form
    .addTextItem()
    .setTitle('Your current company, designation, and since when')
    .setHelpText('e.g. "Data Engineer at TCS, since Jan 2019"')
    .setRequired(true);

  // 12. Offers in hand
  form
    .addMultipleChoiceItem()
    .setTitle('Do you have other offers in hand or final-stage interviews?')
    .setChoiceValues(['No', '1 offer', '2 or more offers', 'Final-stage interviews ongoing'])
    .setRequired(true);

  // 13. Offer details
  form
    .addTextItem()
    .setTitle('If yes — offer details')
    .setHelpText('e.g. "1 offer, 18 LPA, joining 1 Oct"');

  // 14. Reason for change
  form
    .addParagraphTextItem()
    .setTitle('What is your main reason for looking for a change?')
    .setRequired(true);

  // 15. Call slot (with free-text "Other")
  form
    .addMultipleChoiceItem()
    .setTitle('Best time for a quick recruiter call')
    .setChoiceValues([
      'Weekdays 10 am – 1 pm',
      'Weekdays 1 – 5 pm',
      'Weekdays 6 – 8 pm',
      'Weekend',
    ])
    .showOtherOption(true)
    .setRequired(true);

  // 16. Consent (DPDP)
  form
    .addCheckboxItem()
    .setTitle('Consent')
    .setChoiceValues([
      'I agree that MFD stores my answers securely and uses them only for this hiring process.',
    ])
    .setRequired(true);

  // Linked response Sheet
  const sheet = SpreadsheetApp.create('MFD Pre-Screening Responses');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  const shortUrl = form.shortenFormUrl(form.getPublishedUrl());
  Logger.log('==========================================================');
  Logger.log('Candidate link (put this in PRESCREEN_FORM_URL): ' + shortUrl);
  Logger.log('Form editor (to review/tweak):                   ' + form.getEditUrl());
  Logger.log('Responses Sheet:                                 ' + sheet.getUrl());
  Logger.log('==========================================================');
}
