export default function PageMast({
  variant = 'record',
  kicker,
  title,
  lede,
  titleAs: Title = 'h1',
  children,
  className = '',
}) {
  const classes = ['page-mast', `page-mast--${variant}`, className].filter(Boolean).join(' ');

  return (
    <header className={classes}>
      {kicker ? <p className="page-mast__kicker">{kicker}</p> : null}
      {title ? <Title className="page-mast__title">{title}</Title> : null}
      {lede ? <p className="page-mast__lede">{lede}</p> : null}
      {children}
    </header>
  );
}
