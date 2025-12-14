import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, Zap, LogIn } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { name: 'Início', href: '/' },
  { name: 'Sistema', href: '/#sistema' },
  { name: 'Preços', href: '/#precos' },
  { name: 'Suporte', href: '/#suporte' },
  { name: 'Sobre Nós', href: '/#sobre' },
  { name: 'Teste Grátis', href: '/teste-gratis', cta: true },
];

const SiteHeader: React.FC = () => {
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleScrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();

    if (href === '/') {
      if (location.pathname === '/') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        navigate('/');
      }
      setSheetOpen(false);
      return;
    }

    const hashIndex = href.indexOf('#');
    const targetId = hashIndex >= 0 ? href.substring(hashIndex + 1) : '';

    if (location.pathname === '/' && targetId) {
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
        setSheetOpen(false);
        return;
      }
    }

    // Em qualquer outra página ou se o elemento não existir ainda, navega para a rota com hash
    navigate(href);
    setSheetOpen(false);
  };
  
  // Função auxiliar para renderizar links de navegação
  const renderNavLink = (item: typeof NAV_ITEMS[0]) => {
      const isAnchor = item.href.startsWith('/#');
      const isHome = item.href === '/';
      const classes = "text-sm font-medium text-muted-foreground hover:text-foreground transition-colors";

      if (item.cta) {
        return (
          <Link to={item.href}>
            <Button size="sm" variant="default" className="ml-2">
              {item.name}
            </Button>
          </Link>
        );
      }
      
      if (isHome || isAnchor) {
          return (
              <a
                  href={item.href}
                  onClick={(e) => handleScrollToSection(e, item.href)}
                  className={classes}
              >
                  {item.name}
              </a>
          );
      }
      
      return (
          <Link 
              to={item.href} 
              className={classes}
          >
              {item.name}
          </Link>
      );
  };
  
  const renderMobileNavLink = (item: typeof NAV_ITEMS[0]) => {
    if (item.cta) {
      return (
        <Link
          to={item.href}
          onClick={() => setSheetOpen(false)}
          className="text-lg font-semibold text-primary"
        >
          {item.name}
        </Link>
      );
    }
    return (
      <a
        href={item.href}
        onClick={(e) => {
          handleScrollToSection(e, item.href);
          setSheetOpen(false);
        }}
        className="text-lg font-medium text-foreground hover:text-primary transition-colors"
      >
        {item.name}
      </a>
    );
  };

  return (
    <header className={cn(
      "sticky top-0 z-30 flex h-16 items-center justify-between border-b px-4 md:px-8",
      "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    )}>
      <div className="flex items-center space-x-4">
        <Link to="/" className="flex items-center text-xl font-bold text-primary">
          <Zap className="h-6 w-6 mr-2" /> Fluxo de Caixa
        </Link>
      </div>
      
      {/* Navegação Desktop */}
      <nav className="hidden md:flex items-center space-x-6">
        {NAV_ITEMS.map(item => (
          <React.Fragment key={item.name}>
              {renderNavLink(item)}
          </React.Fragment>
        ))}
      </nav>
      
      <div className="flex items-center space-x-2">
        <Link to="/login">
          <Button variant="default" size="sm">
            <LogIn className="w-4 h-4 mr-2" /> Login
          </Button>
        </Link>
        
        {/* Menu Mobile */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" aria-label="Abrir Menu">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-4 w-64">
            <nav className="flex flex-col space-y-4 pt-8">
              {NAV_ITEMS.map(item => (
                <React.Fragment key={item.name}>
                    {renderMobileNavLink(item)}
                </React.Fragment>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
};

export default SiteHeader;
