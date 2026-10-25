import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using the Project RISHI @ UC Berkeley member dashboard.",
};

export default function TermsPage() {
  return (
    <section className="bg-paper pt-[var(--header-h)]">
      <div className="container-rishi max-w-3xl py-16">
        <h1 className="font-display text-4xl font-semibold text-pine-deep">Terms of Service</h1>
        <p className="mt-2 text-sm text-ink/70">Last updated: July 2026</p>

        <div className="mt-8 space-y-6 text-ink/80 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-pine-deep [&_h2]:mt-8 [&_h3]:font-semibold [&_h3]:text-pine-deep [&_h3]:mt-5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-pine [&_a]:underline">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the
            Project RISHI @ UC Berkeley member dashboard (the
            &ldquo;Dashboard&rdquo;), and of the public pages of
            ucbprojectrishi.org. By signing in and using the Dashboard, you agree
            to these Terms. If you don&rsquo;t agree, please don&rsquo;t use the
            Dashboard. How we handle your data is described in our{" "}
            <a href="/privacy">Privacy Policy</a>, which forms part of these
            Terms.
          </p>

          <h2>Who can use the Dashboard</h2>
          <p>
            The Dashboard is a private, internal tool for members of Project
            RISHI @ UC Berkeley. Access is limited to people on the club roster
            and requires signing in with the Google account associated with your
            membership. You are responsible for keeping your account secure and
            for everything that happens under it. Don&rsquo;t share your login,
            and tell an officer promptly if you think your account has been
            misused.
          </p>

          <h2>What the Dashboard is for</h2>
          <p>
            The Dashboard exists to help the club run its work &mdash; assigning
            and tracking tasks, coordinating events and a shared calendar,
            messaging other members, looking up members&rsquo; contact details,
            sending club communications, and viewing chapter history. Please use
            it only for these club purposes.
          </p>

          <h2>Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Dashboard to harass, threaten, demean, bully, or discriminate against anyone.</li>
            <li>Post or send content that is unlawful, hateful, sexually explicit, or otherwise inappropriate for a student organization.</li>
            <li>Send spam, or use the club&rsquo;s connected email accounts to send anything other than legitimate club communications.</li>
            <li>Misuse the reminder or &ldquo;nudge&rdquo; features to pester or harass another member.</li>
            <li>Attempt to access accounts, data, roles, or areas of the system you aren&rsquo;t authorized to use, or try to escalate your own permissions.</li>
            <li>Interfere with the security, integrity, or availability of the service, including probing, scanning, or overloading it.</li>
            <li>Share your access with people outside the club, or export, scrape, or redistribute other members&rsquo; personal information (including the Member Directory) outside the club.</li>
            <li>Use the Dashboard to violate University of California policy or any applicable law.</li>
          </ul>

          <h2>Member Directory</h2>
          <p>
            The Member Directory shows every member&rsquo;s name, role, project
            team, contact email, and phone number to all signed-in members. It is
            provided so members can reach each other about club work. Treat it
            accordingly: contact details found there must be used for club
            purposes only, and must not be shared outside the club or used for
            any commercial, political, or personal solicitation. You control your
            own listed email and phone and can change or clear them at any time.
          </p>

          <h2>Messages and content you create</h2>
          <p>
            You are responsible for the tasks, comments, submissions, messages,
            announcements, and other content you create. Content you share is
            visible to the members you share it with, and chat and other messages
            are stored so conversations persist. Deleting a conversation removes
            it from your own list; it does not delete it for other participants.
          </p>
          <p>
            Club officers may view, moderate, or remove content, and may restrict
            access, where needed to keep the community safe, to run the club, or
            to enforce these Terms. Be respectful &mdash; treat the chat and the
            Dashboard the way you would treat any club space.
          </p>

          <h2>Accounts, roles, and access</h2>
          <p>
            Different roles (for example member, lead, NMT leader, exec, VP or
            President, and Webmaster) can do different things in the Dashboard,
            and some features are limited accordingly. The Webmaster is the site
            administrator and holds every permission, including managing the
            roster.
          </p>
          <p>
            Membership and roles are maintained by officers on the club roster.
            Your access is tied to your membership: when you leave the club or
            your role changes, your access may be changed or removed, and content
            you created may remain in the club&rsquo;s records. The club may
            suspend or revoke access for misuse or violation of these Terms.
          </p>

          <h2>Email, calendar, and notifications</h2>
          <p>
            Connecting a personal Google Calendar, or a Google account for
            sending, is optional and controlled by you; the club&rsquo;s shared
            sending accounts are controlled by authorized officers. You agree to
            use these features only as intended, and not to send unauthorized,
            misleading, or personal email through a connected club account.
          </p>
          <p>
            By taking part in club work you may receive automated notification and
            reminder emails and, if you allow them, browser notifications. You can
            turn browser notifications off at any time. See the Privacy Policy for
            exactly what each connection can and cannot do.
          </p>

          <h2>Club records and Google Sheets</h2>
          <p>
            The club keeps copies of directory, task, and roster information in
            private Google Sheets so records are usable outside the Dashboard.
            Officers with access to those sheets must handle them under these
            Terms and the Privacy Policy, and must not share them outside the
            club.
          </p>

          <h2>Availability and changes to the service</h2>
          <p>
            The Dashboard is maintained by student volunteers. We may add, change,
            or remove features, or suspend the service, at any time and without
            notice. We may also perform maintenance that makes the Dashboard
            temporarily unavailable.
          </p>

          <h2>Third-party services</h2>
          <p>
            The Dashboard relies on third-party services, including Google
            (sign-in, Calendar, Gmail, and Sheets), Supabase (database), and
            Vercel (hosting). Your use of those integrations is also subject to
            those companies&rsquo; own terms and policies, and we aren&rsquo;t
            responsible for their services.
          </p>

          <h2>Intellectual property</h2>
          <p>
            The Project RISHI name, site content, and branding belong to Project
            RISHI and are used with permission by the UC Berkeley chapter. Please
            don&rsquo;t copy, redistribute, or reuse them outside the club without
            permission. You keep ownership of the content you create, and you
            grant the club a non-exclusive right to store, display, and use it as
            needed to operate the Dashboard and keep club records.
          </p>

          <h2>No warranty</h2>
          <p>
            The Dashboard is a volunteer-built internal tool provided on an
            &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis, without
            warranties of any kind, express or implied. We don&rsquo;t guarantee
            that it will always be available or error-free, that data will never
            be lost, or that notifications, reminders, calendar syncs, or emails
            will always be delivered or delivered on time. Don&rsquo;t rely on it
            as your only record of anything important.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent allowed by law, Project RISHI @ UC Berkeley and
            the people who build and run the Dashboard are not liable for any
            indirect, incidental, special, or consequential damages, or for any
            lost data, arising from your use of the Dashboard. It is an internal
            club tool, not a commercial service.
          </p>

          <h2>Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be
            reflected by the &ldquo;Last updated&rdquo; date above, and your
            continued use of the Dashboard means you accept the updated Terms.
          </p>

          <h2>Governing law</h2>
          <p>
            These Terms are governed by the laws of the State of California,
            United States, without regard to its conflict-of-laws rules.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these Terms? Email us at{" "}
            <a href="mailto:sachitkumar2025@gmail.com">sachitkumar2025@gmail.com</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
