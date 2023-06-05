# SendMailGmailAPINodeJS
A reply to mails received in gmail sent using google apis in nodejs

A NodeJS project using googleapis npm library with google authentication feature. A google console project is created and Gmail API with necessary scope is enabled.

The app runs at an interval of 90 seconds.

The app scans for any new email in inbox and checks whether a reply has been sent by the user earlier and if not, sends an automated reply and adds that mails to a separate label that exist already or created if it isnt.

