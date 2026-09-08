import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "solid" | "secondary" | "ghost" | "whatsapp";
type Size = "sm" | "md" | "lg";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconPosition?: "start" | "end";
  /** Adds the hover light-sweep. On by default for the filled variants. */
  shine?: boolean;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
  onClick?: () => void;
};

type ButtonProps = ButtonAsButton | ButtonAsLink;

const variantClass: Record<Variant, string> = {
  primary: "btn-primary",
  solid: "btn-solid",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  whatsapp: "btn-whatsapp",
};

const sizeClass: Record<Size, string> = {
  sm: "btn-sm",
  md: "btn-md",
  lg: "btn-lg",
};

const shineByDefault: Variant[] = ["primary", "solid", "whatsapp"];

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    icon,
    iconPosition = "start",
    shine,
    className,
    children,
  } = props;

  const classes = cn(
    "btn",
    variantClass[variant],
    sizeClass[size],
    (shine ?? shineByDefault.includes(variant)) && "shine",
    className
  );

  const content = (
    <>
      {icon && iconPosition === "start" ? <span className="shrink-0">{icon}</span> : null}
      <span>{children}</span>
      {icon && iconPosition === "end" ? <span className="shrink-0">{icon}</span> : null}
    </>
  );

  if ("href" in props && props.href) {
    return (
      <Link
        href={props.href}
        target={props.target}
        rel={props.rel}
        onClick={props.onClick}
        className={classes}
      >
        {content}
      </Link>
    );
  }

  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    variant: _variant,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    size: _size,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    icon: _icon,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    iconPosition: _iconPosition,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    shine: _shine,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    className: _className,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    children: _children,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    href: _href,
    ...nativeProps
  } = props as ButtonAsButton;

  return (
    <button className={classes} {...nativeProps}>
      {content}
    </button>
  );
}

/** Square icon-only control — header actions, modal close buttons. */
export function IconButton({
  children,
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-soft",
        "transition duration-200 hover:border-accent/60 hover:bg-accent/10 hover:text-accent active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
