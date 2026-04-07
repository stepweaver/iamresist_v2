export default function Card({ children, className = '', variant = 'default', ...props }) {
    const baseStyles = 'bg-transparent border transition-all duration-300';
  
    const variants = {
      default: 'border-border hover:border-primary',
      primary: 'border-l-4 border-primary hover:border-primary-dark',
      'primary-left-2': 'border-l-2 border-primary',
    };
  
    return (
      <div className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
        {children}
      </div>
    );
  }
  
  