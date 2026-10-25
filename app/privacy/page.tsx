import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How the Project RISHI @ UC Berkeley member dashboard handles your data.",
};

export default function PrivacyPage() {
  return (
    <section className="bg-paper pt-[var(--header-h)]">
      <div className="container-rishi max-w-3xl py-16">
        <h1 className="font-display text-4xl font-semibold text-pine-deep">Privacy Policy</h1>
        <p className="mt-2 text-sm text-ink/70">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-ink/80 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-pine-deep [&_h2]:mt-8 [&_h3]:font-semibold [&_h3]:text-pine-deep [&_h3]:mt-5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-pine [&_a]:underline">
          <p>
            This policy explains how the Project RISHI @ UC Berkeley member
            dashboard (the &ldquo;Dashboard&rdquo;) collects, uses, stores, and
            shares information. It applies to members who sign in to the
            Dashboard. The public pages of our website do not require an account
            and do not collect personal information beyond standard web traffic
            and analytics.
          </p>

          <h2>Who we are</h2>
          <p>
            Project RISHI @ UC Berkeley is a registered student organization at
            the University of California, Berkeley. We are the controller of the
            information described here. You can reach us at{" "}
            <a href="mailto:sachitkumar2025@gmail.com">sachitkumar2025@gmail.com</a>.
          </p>

          <h2>Who can access the Dashboard</h2>
          <p>
            The Dashboard is private to our club. Only email addresses on our
            member roster can sign in; the roster is checked on our server every
            time someone logs in, so it cannot be bypassed from a browser. When
            you leave the club, an officer removes you from the roster and your
            access ends.
          </p>

          <h2>What we collect</h2>

          <h3>From your Google account</h3>
          <p>
            When you sign in with Google we receive your <strong>name</strong>,{" "}
            <strong>email address</strong>, and your Google account identifier.
            We use these only to identify you as a club member and to display
            your name in the Dashboard. Signing in uses basic, non-sensitive
            permissions only; it does not give us access to your Gmail, your
            Calendar, your Drive, or your contacts.
          </p>

          <h3>Information the club records about you</h3>
          <ul>
            <li>
              <strong>Roster information</strong> &mdash; your name, club email,
              project team, phone number (if provided), and the roles you hold
              (for example lead, exec, VP). Roles determine what you can do in
              the Dashboard.
            </li>
            <li>
              <strong>Contact details in the Member Directory</strong> &mdash;
              your name, role, project team, contact email, and phone number.
              Every signed-in member can view the directory. You can edit your
              own contact email and phone at any time; doing so changes only the
              directory listing and never the email you log in with.
            </li>
            <li>
              <strong>Profile photo</strong> &mdash; only if you upload one.
            </li>
          </ul>

          <h3>Information created as you use the Dashboard</h3>
          <ul>
            <li>
              <strong>Tasks and events</strong> &mdash; titles, descriptions,
              dates, tags, who assigned them and to whom, completion status, and
              a full activity history of each item (created, submitted, approved,
              returned, reminder sent, edited, archived).
            </li>
            <li>
              <strong>Task submissions and comments</strong> &mdash; any note or
              link you submit to complete a task, when you submitted it, and
              comments you or others leave on a task.
            </li>
            <li>
              <strong>Chat messages</strong> &mdash; the direct messages and
              group-chat messages you send through the Dashboard, the members
              included in each conversation, and emoji reactions. Messages are
              stored so conversations persist between sessions.
            </li>
            <li>
              <strong>Notifications</strong> &mdash; a record of the
              notifications shown to you in the Dashboard, which mirror the
              emails we send you.
            </li>
            <li>
              <strong>Announcements and newsletters</strong> &mdash; their
              content, who sent them, who received them, and whether you have
              read them.
            </li>
            <li>
              <strong>Newsletter subscriptions</strong> &mdash; if you subscribe
              through the signup on our public site, we store the email address
              you provide. This is the only item here that applies to
              non-members.
            </li>
          </ul>

          <h2>Google Calendar access (optional)</h2>
          <p>
            Connecting your Google Calendar is optional and off by default. If
            you choose to connect it, we request the{" "}
            <code>calendar.events</code> permission so we can add the tasks and
            events assigned to you in the Dashboard to your own Google Calendar.
          </p>
          <p>
            This sync is strictly <strong>one-way</strong> (Dashboard &rarr; your
            calendar). We only create and update the events our app created. We
            never read, list, or import your existing calendar events, and your
            personal calendar is never shown to other members. You can disconnect
            at any time from Settings, which stops syncing and removes the events
            we added, or revoke access directly in your Google Account settings.
            We request <code>calendar.events</code> rather than the broader{" "}
            <code>calendar</code> permission because managing events is all we
            need.
          </p>

          <h2>Gmail send access (optional)</h2>
          <p>
            So the Dashboard can send email on the club&rsquo;s behalf, an
            authorized officer connects club Google accounts using{" "}
            <strong>send-only</strong> permission (the <code>gmail.send</code>{" "}
            scope). This permission can only send messages &mdash; it can never
            read, view, modify, or delete mail in the connected account.
          </p>
          <p>The club uses two separate connected accounts:</p>
          <ul>
            <li>
              an <strong>announcements account</strong>, for officer-composed
              announcements and newsletters; and
            </li>
            <li>
              a <strong>notifications account</strong>, for automated task and
              event notifications, due-date reminders, and manual reminders
              (&ldquo;nudges&rdquo;) sent by a task&rsquo;s assigner.
            </li>
          </ul>
          <p>
            Members may also optionally connect their own Google account to send
            messages they personally author. The tokens that permit sending are
            stored securely on our server and are never exposed to the browser or
            shared with other members.
          </p>

          <h2>Background notifications (optional)</h2>
          <p>
            If you allow browser notifications, we store a push subscription for
            that browser or device so we can deliver Dashboard notifications and
            new chat messages even when the site isn&rsquo;t open. You can turn
            this off at any time in your browser or device settings, which stops
            the notifications and lets us discard the subscription. Subscriptions
            that your browser reports as expired are deleted automatically.
          </p>

          <h2>Google Sheets copies</h2>
          <p>
            To keep records the club can work with outside the Dashboard, we copy
            certain Dashboard data into private Google Sheets owned by the club:
          </p>
          <ul>
            <li>
              a <strong>directory sheet</strong>, containing each member&rsquo;s
              name, role, project team, contact email, and phone number;
            </li>
            <li>
              a <strong>task sheet</strong>, containing tasks, who assigned and
              received them, status, due dates, submission notes and links, and
              submission history; and
            </li>
            <li>
              a <strong>roster sheet</strong>, containing each member&rsquo;s
              login email, name, project team, phone number, and roles. Officers
              edit this sheet to add or remove members and change roles, and the
              Dashboard reads it back, so this sheet controls who can sign in.
            </li>
          </ul>
          <p>
            These sheets are not public. They are shared only with the club
            account and with a Google service account that our server uses to
            write to them. Access is controlled by the club through Google Drive
            sharing settings. If you are a member, please be aware that your
            contact details and task activity appear in these sheets, and that
            anyone the club shares a sheet with can see them.
          </p>

          <h2>How information is stored and protected</h2>
          <p>
            Dashboard data is stored in a secured Postgres database (Supabase)
            that is reachable only by our server using a private service key.
            Row-level security is enabled on every table, so no public or
            browser-side key can read them. Access tokens for Google Calendar,
            Gmail sending, and the Sheets service account are stored server-side
            only and never touch your browser. Traffic to the site is encrypted
            in transit (HTTPS).
          </p>
          <p>
            We are a volunteer, student-run organization. We take reasonable
            measures to protect your information, but no system can be guaranteed
            perfectly secure.
          </p>

          <h2>How we use it</h2>
          <p>We use the information above only to run the club:</p>
          <ul>
            <li>to let you sign in and to decide what you can do in the Dashboard;</li>
            <li>to assign, track, and complete club work, and to coordinate events;</li>
            <li>to send you notifications, reminders, announcements, and newsletters;</li>
            <li>to let members contact one another through the directory and chat; and</li>
            <li>to keep club records that outlive any single semester&rsquo;s officers.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your information, use it for
            advertising, or use it to train machine-learning models.
          </p>

          <h2>Who we share it with</h2>
          <p>
            We share information only with the service providers needed to run
            the Dashboard, and with other club members where that is the point of
            the feature (for example, the directory and chat). Our providers are:
          </p>
          <ul>
            <li><strong>Vercel</strong> &mdash; hosting and analytics;</li>
            <li><strong>Supabase</strong> &mdash; database;</li>
            <li>
              <strong>Google</strong> &mdash; sign-in, and (only where you or an
              officer connected it) Calendar, Gmail sending, and Google Sheets.
            </li>
          </ul>
          <p>
            We may also disclose information if required by law or to protect the
            safety of our members.
          </p>

          <h2>Google API disclosure</h2>
          <p>
            Project RISHI&rsquo;s use and transfer of information received from
            Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We request only the Google
            Calendar (<code>calendar.events</code>) and Gmail send
            (<code>gmail.send</code>) permissions described above, use them solely
            to provide those features to the member who granted them, and do not
            transfer that data to others except as necessary to provide the
            feature, for security purposes, or to comply with applicable law. We
            do not use Google user data for advertising, and we do not allow
            humans to read it except where you explicitly ask us to, where it is
            necessary for security, or where required by law.
          </p>

          <h2>Data retention</h2>
          <p>
            We keep Dashboard data for as long as it is needed to run the club,
            since past tasks, events, and chapter history are part of our
            records. When you leave the club or ask us to, we remove your roster
            entry and your account information, and your access ends. Content you
            created that was shared with others (such as tasks, comments, or
            messages sent in a conversation) may remain visible to those members
            unless you ask us to remove it. Disconnecting a Google integration
            deletes the stored token for it.
          </p>

          <h2>Your choices and rights</h2>
          <ul>
            <li>
              <strong>Your contact details</strong> &mdash; edit your directory
              email and phone yourself, from the directory page or Settings.
            </li>
            <li>
              <strong>Google Calendar</strong> &mdash; connect or disconnect at
              any time in Settings, or revoke access in your Google Account.
            </li>
            <li>
              <strong>Gmail sending</strong> &mdash; if you connected your own
              account, disconnect it at any time in Settings.
            </li>
            <li>
              <strong>Background notifications</strong> &mdash; turn them off in
              your browser or device settings.
            </li>
            <li>
              <strong>Chat</strong> &mdash; delete a conversation from your own
              list at any time.
            </li>
            <li>
              <strong>Newsletter</strong> &mdash; unsubscribe using the link in
              any newsletter email.
            </li>
            <li>
              <strong>Access, correction, or deletion</strong> &mdash; email us
              at the address above and we will help.
            </li>
          </ul>

          <h2>Eligibility</h2>
          <p>
            The Dashboard is intended for members of Project RISHI @ UC Berkeley,
            who are university students and generally 18 or older. It is not
            directed to children, and we do not knowingly collect information
            from anyone under 13.
          </p>

          <h2>Changes</h2>
          <p>
            We may update this policy from time to time. Material changes will be
            reflected by the &ldquo;Last updated&rdquo; date above, and, where
            appropriate, announced in the Dashboard.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy, or a request about your data? Email{" "}
            <a href="mailto:sachitkumar2025@gmail.com">sachitkumar2025@gmail.com</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
