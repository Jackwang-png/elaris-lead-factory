import Nav from "./Nav";
import Footer from "./Footer";
import {
  Hero,
  Product,
  CustomerService,
  BusinessIntelligence,
  Orders,
  Inventory,
  MobileApp,
  HumanHandoff,
  Ecosystem,
  CTA,
} from "./sections";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Product />
        <CustomerService />
        <BusinessIntelligence />
        <Orders />
        <Inventory />
        <MobileApp />
        <HumanHandoff />
        <Ecosystem />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
