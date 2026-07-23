import logo from '../assets/logo.svg';

interface LoadingProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const sizeMap: Record<NonNullable<LoadingProps['size']>, string> = {
  xs: 'w-4 h-4',
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

/**
 * Loading spinner component using the Gatus logo.
 * Renders a centered, spinning logo with grayscale effect.
 */
export function Loading({ size = 'md' }: LoadingProps) {
  return (
    <div className="flex justify-center items-center">
      <img
        src={logo}
        alt="Gatus logo"
        className={`animate-spin rounded-full opacity-60 grayscale ${sizeMap[size]}`}
      />
    </div>
  );
}
