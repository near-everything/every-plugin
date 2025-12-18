import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_page/privacy-policy")({
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <>
      <h1 className="text-base font-normal mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: December 16, 2025
      </p>

      <div className="bg-muted/30 p-6 rounded-lg mb-8">
        <p className="text-sm text-muted-foreground">
          This is a placeholder for the Privacy Policy. Replace this content with your
          actual privacy practices and policies.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">1. Introduction</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Introduce your commitment to privacy and the purpose of this policy.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">2. Information We Collect</h2>
        <p className="text-muted-foreground mb-3">
          [Placeholder: Describe the types of information collected from users:]
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Personal information (name, email, shipping address)</li>
          <li>Payment information</li>
          <li>NEAR wallet addresses</li>
          <li>Browser and device information</li>
          <li>Usage data and analytics</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">3. How We Use Your Information</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain how collected information is used - order processing,
          communications, service improvement, etc.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">4. Information Sharing</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Detail when and with whom information may be shared - payment processors,
          shipping partners, legal requirements, etc.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">5. Blockchain and Cryptocurrency</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain privacy implications of blockchain transactions, wallet addresses
          being public, and NEAR Protocol integration.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">6. Cookies and Tracking</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Describe use of cookies, analytics tools, and tracking technologies.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">7. Data Security</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Outline security measures taken to protect user information and
          limitations of security.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">8. Data Retention</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain how long different types of data are retained and deletion
          policies.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">9. Your Privacy Rights</h2>
        <p className="text-muted-foreground mb-3">
          [Placeholder: Detail user rights regarding their personal information:]
        </p>
        <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
          <li>Access and review your data</li>
          <li>Request corrections or updates</li>
          <li>Request deletion of your data</li>
          <li>Opt-out of marketing communications</li>
          <li>Data portability</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">10. Third-Party Services</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Describe integration with third-party services and their privacy
          practices.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">11. International Data Transfers</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: If applicable, explain how data is transferred and protected
          internationally.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">12. Children's Privacy</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: State policies regarding collection of information from children under
          13.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">13. Regional Privacy Laws</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Address GDPR (California), and other regional privacy
          regulations as applicable.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">14. Policy Updates</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain how users will be notified of privacy policy changes.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">15. Contact Us</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Provide contact information for privacy-related questions and data
          requests.]
        </p>
        <hr className="border-t border-border my-6" />
        <p className="text-muted-foreground">
          For privacy-related questions or to exercise your privacy rights, please contact us at{" "}
          <a href="mailto:privacy@near.org" className="text-primary hover:underline">
            privacy@near.org
          </a>
        </p>
      </section>
    </>
  );
}
