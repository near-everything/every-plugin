import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_page/terms-of-service")({
  component: TermsOfService,
});

function TermsOfService() {
  return (
    <>
      <h1 className="text-base font-normal mb-2">Terms of Service</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: December 16, 2025
      </p>

      <div className="bg-muted/30 p-6 rounded-lg mb-8">
        <p className="text-sm text-muted-foreground">
          This is a placeholder for the Terms of Service. Replace this content with your
          actual terms and conditions.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">1. Acceptance of Terms</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain that by using the service, users agree to these terms.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">2. Use of Service</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Define acceptable use of the platform and user responsibilities.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">3. Account Responsibilities</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Detail user account obligations, security, and NEAR wallet integration requirements.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">4. Products and Pricing</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain product descriptions, pricing accuracy, and availability disclaimers.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">5. Payment Terms</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Detail payment methods, processing, blockchain transaction terms, and fees.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">6. Shipping and Delivery</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Outline shipping policies, delivery timeframes, and risk of loss transfer.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">7. Returns and Refunds</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Define return policy, refund process, and conditions for returns.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">8. Intellectual Property Rights</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: State ownership of content, trademarks, and user license grants.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">9. Prohibited Activities</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: List prohibited uses including fraud, unauthorized access, and illegal activities.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">10. Disclaimers and Warranties</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Include "as-is" disclaimers and warranty limitations.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">11. Limitation of Liability</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Limit liability for damages, losses, and service interruptions.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">12. Indemnification</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Require user indemnification for violations and third-party claims.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">13. Termination and Suspension</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Define termination rights, suspension conditions, and effects of termination.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">14. Dispute Resolution</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Specify arbitration requirements, class action waivers, and dispute procedures.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">15. Governing Law</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: State applicable jurisdiction and choice of law.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">16. Changes to Terms</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Explain modification rights and user notification procedures.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">17. General Provisions</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Include severability, waiver, entire agreement, and assignment clauses.]
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-4">18. Contact Information</h2>
        <p className="text-muted-foreground mb-4">
          [Placeholder: Provide official contact details for legal notices and questions.]
        </p>
        <hr className="border-t border-border my-6" />
        <p className="text-muted-foreground">
          For questions about these Terms of Service, please contact us at{" "}
          <a href="mailto:legal@near.org" className="text-primary hover:underline">
            legal@near.org
          </a>
        </p>
      </section>
    </>
  );
}
