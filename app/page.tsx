import Navbar from '@/components/navbar';
import Hero from '@/components/hero';
import AboutGuanlanBrief from '@/components/about-guanlan-brief';
import DualEcosystem from '@/components/dual-ecosystem';
import MethodologySection from '@/components/methodology-section';
import AIVisibilityScanner from '@/components/ai-visibility-scanner';
import GEOAuditSystem from '@/components/geo-audit-system';
import FAQSection from '@/components/faq-section';
import Footer from '@/components/footer';
import SchemaOrg from '@/components/schema-org';
import FounderSchema from '@/components/founder-schema';
import { GEOStructuredData } from '@/components/geo-structured-data';
import SEACommandCenterSection from '@/components/sea-command-center-section';
import { SEACommandCenterSchemaLD } from '@/components/sea-command-center-schema';

export default function Home() {
  return (
    <>
      <SchemaOrg />
      <FounderSchema />
      <GEOStructuredData />
      <SEACommandCenterSchemaLD />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <AboutGuanlanBrief />
        <DualEcosystem />
        <MethodologySection />
        <section id="ai-baseline">
          <AIVisibilityScanner />
        </section>
        <GEOAuditSystem />
        <SEACommandCenterSection />
        <FAQSection />
      </main>
      <Footer />
    </>
  );
}
