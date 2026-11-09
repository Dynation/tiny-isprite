/// <reference types="react" />
import React from 'react';

export interface IconProps {
    name: string;
    size?: number;
    className?: string;
    external?: boolean;
    /** Generated content-hashed URL. Supplying it enables external mode. */
    spriteUrl?: string;
    /** Optional version for legacy URLs; hashed filenames are preferred. */
    version?: string | number;
    prefix?: string;
}

export const Icon = ({
    name, size = 24, className, external = false,
    spriteUrl, version, prefix = 'icon-',
}: IconProps) => {
    let resource = spriteUrl ?? '/sprite.svg';
    // The fragment selects a symbol and is not part of the HTTP cache key.
    resource = resource.split('#')[0];
    if (version !== undefined) {
        const queryIndex = resource.indexOf('?');
        const pathname = queryIndex === -1 ? resource : resource.slice(0, queryIndex);
        const query = queryIndex === -1 ? '' : resource.slice(queryIndex + 1);
        const params = new URLSearchParams(query);
        params.set('v', String(version));
        resource = `${pathname}?${params.toString()}`;
    }
    const href = `${external || spriteUrl !== undefined ? resource : ''}#${prefix}${name}`;
    return (
        <svg width={size} height={size} className={className}
            aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <use key={href} href={href} xlinkHref={href} />
        </svg>
    );
};

export default Icon;
