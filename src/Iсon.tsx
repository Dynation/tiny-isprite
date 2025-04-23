/// <reference types="react" />
import React from 'react';

interface IconProps {
    name: string;
    size?: number;
    className?: string;
    external?: boolean;
}

export const Icon = ({
    name,
    size = 24,
    className,
    external = false,
}: IconProps) => {
    const href = external
        ? `/sprite.svg#icon-${name}`
        : `#icon-${name}`;

    return (
        <svg
            width={size}
            height={size}
            className={className}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <use xlinkHref={href} />
        </svg>
    );
};

