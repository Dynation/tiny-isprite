import React from 'react';

interface IconProps {
    name: string;
    size?: number;
    className?: string;
    external?: boolean;
}
declare const Icon: ({ name, size, className, external, }: IconProps) => React.JSX.Element;

export { Icon };
