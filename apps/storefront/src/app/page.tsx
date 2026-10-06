
const categories = [
  {
    title: "Home & Living",
    subtitle: "Przestrzeń, w której dobrze się żyje",
    description: "Meble, oświetlenie i dodatki do codziennych chwil.",
    image: "photo-1616486338812-3dadae4b4ace",
    number: "01",
  },
  {
    title: "Travel & Organization",
    subtitle: "W dobrym stylu, dokądkolwiek zmierzasz",
    description: "Organizery, torby i sprytne rozwiązania w podróży.",
    image: "photo-1488646953014-85cb44e25828",
    number: "02",
  },
  {
    title: "Lifestyle",
    subtitle: "Małe przyjemności. Wielki styl.",
    description: "Przedmioty, które sprawiają, że codzienność nabiera charakteru.",
    image: "photo-1517248135467-4c7edcad34c4",
    number: "03",
  },
  {
    title: "Fashion & Accessories",
    subtitle: "Detale, które robią różnicę",
    description: "Moda damska, torebki, biżuteria i dodatki do Twoich stylizacji.",
    image: "photo-1490481651871-ab68de25d43d",
    number: "04",
  },
];

export default function Home() {
  return (
    <main>
      <div className="announcement">
        Przemyślane wybory. Styl na co dzień.
      </div>

      <header className="site-header">
        <a className="brand" href="#" aria-label="Giovetta Living — strona główna">
          <span>GIOVETTA</span>
          <small>L I V I N G</small>
        </a>
        <nav className="main-nav" aria-label="Nawigacja główna">
          <a className="active" href="#">Strona główna</a>
          <a href="#kategorie">Kategorie</a>
          <a href="#giovetta">Świat Giovetty</a>
          <a href="#kontakt">Kontakt</a>
        </nav>
        <a className="header-link" href="#kategorie" aria-label="Odkryj kategorie">
          <span className="search-symbol" aria-hidden="true">⌕</span>
          <span className="header-link-label">Odkryj</span>
        </a>
      </header>

      <section className="hero">
        <div
          className="hero-photo"
          role="img"
          aria-label="Stylowa przestrzeń lifestyle w naturalnych kolorach"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <p className="eyebrow">LA VITA, CON STILE</p>
          <h1>Styl, który<br />pasuje do<br /><em>Twojego życia.</em></h1>
          <p className="hero-description">
            Od dobrze zaprojektowanej przestrzeni, przez podróże,
            po dodatki, które dopełniają Twój styl. Odkrywaj rzeczy,
            które łączą estetykę z codzienną funkcjonalnością.
          </p>
          <a className="button button-dark" href="#kategorie">
            Odkryj nasze światy <span aria-hidden="true">→</span>
          </a>
          <p className="hero-note">Mądre wybory. Ponadczasowy styl.</p>
        </div>
        <div className="hero-index"><span>01</span> <i /> 04</div>
      </section>

      <section className="category-section section-wrap" id="kategorie">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ODKRYJ GIOVETTA LIVING</p>
            <h2>Cztery światy.<br /><em>Jeden styl.</em></h2>
          </div>
          <p className="section-intro">
            Przedmioty do domu, w podróż i na co dzień — wybierane
            z myślą o estetyce, funkcjonalności i Twoim rytmie życia.
          </p>
        </div>

        <div className="category-grid">
          {categories.map((category) => (
            <a className="category-card" href="#giovetta" key={category.title}>
              <div
                className="category-image"
                role="img"
                aria-label={category.title}
                style={{
                  backgroundImage: `url(https://images.unsplash.com/${category.image}?auto=format&fit=crop&w=900&q=85)`,
                }}
              />
              <span className="category-number">{category.number}</span>
              <div className="category-caption">
                <div>
                  <h3>{category.title}</h3>
                  <p>{category.subtitle}</p>
                </div>
                <span className="category-arrow" aria-hidden="true">↗</span>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="brand-story" id="giovetta">
        <div
          className="story-image"
          role="img"
          aria-label="Inspirująca przestrzeń do codziennych spotkań"
        />
        <div className="story-copy">
          <p className="eyebrow">POZNAJ GIOVETTĘ</p>
          <h2>Nie tylko rzeczy.<br />Cały <em>styl życia.</em></h2>
          <p>
            Giovetta inspiruje do odkrywania piękna w codzienności.
            W domu, w ulubionej kawiarni i w drodze na kolejny wyjazd.
            Pokazujemy produkty w naturalnych sytuacjach, tak aby łatwiej
            było wyobrazić sobie je we własnym życiu.
          </p>
          <p>
            Produkty prezentowane jako dostępne do zakupu muszą odpowiadać
            rzeczywistej ofercie Giovetta Living.
          </p>
          <a className="text-link" href="#kontakt">
            Nasza filozofia <span>→</span>
          </a>
        </div>
      </section>

      <section className="closing-section" id="kontakt">
        <p className="eyebrow">GIOVETTA LIVING</p>
        <h2>Wybieraj świadomie.<br /><em>Żyj po swojemu.</em></h2>
        <p>Odkryj cztery kategorie stworzone z myślą o codziennym stylu.</p>
        <a className="button button-light" href="#kategorie">
          Poznaj kategorie <span aria-hidden="true">→</span>
        </a>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#">
          <span>GIOVETTA</span><small>L I V I N G</small>
        </a>
        <p>La vita, con stile.</p>
        <span>© {new Date().getFullYear()} Giovetta Living</span>
      </footer>
    </main>
  );
}