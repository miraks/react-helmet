import React from "react";
import withSideEffect from "react-side-effect";
import deepEqual from "deep-equal";
import {
    TAG_NAMES,
    TAG_PROPERTIES,
    REACT_TAG_MAP
} from "./HelmetConstants.js";
import HTMLEntities from "he";

const HELMET_ATTRIBUTE = "data-react-helmet";

const getInnermostProperty = (propsList, property) => {
    for (const props of [...propsList].reverse()) {
        if (props[property]) {
            return props[property];
        }
    }

    return null;
};

const getTitleFromPropsList = (propsList) => {
    const innermostTitle = getInnermostProperty(propsList, "title");
    const innermostTemplate = getInnermostProperty(propsList, "titleTemplate");

    if (innermostTemplate && innermostTitle) {
        return innermostTemplate.replace(/\%s/g, innermostTitle);
    }

    return innermostTitle || "";
};

const getBaseTagFromPropsList = (propsList) => {
    const baseTag = getInnermostProperty(propsList, "base");

    return baseTag ? [baseTag] : [];
};

const getTagsFromPropsList = (tagName, uniqueTagIds, propsList) => {
    // Calculate list of tags, giving priority innermost component (end of the propslist)
    const approvedSeenTags = new Map();
    const validTags = Object.keys(TAG_PROPERTIES).map(key => TAG_PROPERTIES[key]);

    const tagList = propsList
        .filter(props => !Object.is(typeof props[tagName], "undefined"))
        .map(props => props[tagName])
        .reverse()
        .reduce((approvedTags, instanceTags) => {
            const instanceSeenTags = new Map();

            instanceTags.filter(tag => {
                for (const attributeKey of Object.keys(tag)) {
                    const lowerCaseAttributeKey = attributeKey.toLowerCase();
                    const value = tag[attributeKey].toLowerCase();

                    if (Object.is(validTags.indexOf(lowerCaseAttributeKey), -1)) {
                        return false;
                    }

                    if (!approvedSeenTags.has(lowerCaseAttributeKey)) {
                        approvedSeenTags.set(lowerCaseAttributeKey, new Set());
                    }

                    if (!instanceSeenTags.has(lowerCaseAttributeKey)) {
                        instanceSeenTags.set(lowerCaseAttributeKey, new Set());
                    }

                    if (!approvedSeenTags.get(lowerCaseAttributeKey).has(value)) {
                        instanceSeenTags.get(lowerCaseAttributeKey).add(value);
                        return true;
                    }

                    return false;
                }
            })
            .reverse()
            .forEach(tag => approvedTags.push(tag));

            // Update seen tags with tags from this instance
            for (const attributeKey of instanceSeenTags.keys()) {
                const tagUnion = new Set([
                    ...approvedSeenTags.get(attributeKey),
                    ...instanceSeenTags.get(attributeKey)
                ]);

                approvedSeenTags.set(attributeKey, tagUnion);
            }

            instanceSeenTags.clear();
            return approvedTags;
        }, []);

    return tagList;
};

const updateTitle = title => {
    document.title = title || document.title;
};

const updateTags = (type, tags) => {
    const headElement = document.head || document.querySelector("head");
    const existingTags = headElement.querySelectorAll(`${type}[${HELMET_ATTRIBUTE}]`);

    // Remove any tags previously injected by Helmet
    Array.forEach(existingTags, tag => tag.parentNode.removeChild(tag));

    if (tags && tags.length) {
        tags.forEach(tag => {
            const newElement = document.createElement(type);

            for (const attribute in tag) {
                if (tag.hasOwnProperty(attribute)) {
                    newElement.setAttribute(attribute, tag[attribute]);
                }
            }

            newElement.setAttribute(HELMET_ATTRIBUTE, "true");
            headElement.insertBefore(newElement, headElement.firstChild);
        });
    }
};

const generateTagsAsString = (type, tags) => {
    const html = tags.map(tag => {
        const attributeHtml = Object.keys(tag)
            .map((attribute) => {
                const encodedValue = HTMLEntities.encode(tag[attribute], {
                    useNamedReferences: true
                });
                return `${attribute}="${encodedValue}"`;
            })
            .join(" ");

        return `<${type} ${HELMET_ATTRIBUTE}="true" ${attributeHtml}>`;
    });

    return html.join("");
};

const generateTagsAsReactComponent = (type, tags) => {
    const component = [...tags].map((tag, i) => {
        const mappedTag = {
            key: i,
            [HELMET_ATTRIBUTE]: true
        };

        Object.keys(tag).forEach((attribute) => {
            const mappedAttribute = REACT_TAG_MAP[attribute] || attribute;

            mappedTag[mappedAttribute] = HTMLEntities.encode(tag[attribute], {
                useNamedReferences: true
            });
        });

        return React.createElement(type, mappedTag);
    });

    component.toString = () => generateTagsAsString(type, tags);
    return component;
};

class Helmet extends React.Component {
    /**
     * @param {String} title: "Title"
     * @param {String} titleTemplate: "MySite.com - %s"
     * @param {String} base: {"target": "_blank", "href": "http://mysite.com/"}
     * @param {Object} meta: [{"name": "description", "content": "Test description"}]
     * @param {Object} link: [{"rel": "canonical", "href": "http://mysite.com/example"}]
     */
    static propTypes = {
        title: React.PropTypes.string,
        titleTemplate: React.PropTypes.string,
        base: React.PropTypes.object,
        meta: React.PropTypes.arrayOf(React.PropTypes.object),
        link: React.PropTypes.arrayOf(React.PropTypes.object)
    }

    shouldComponentUpdate(nextProps) {
        return !deepEqual(this.props, nextProps);
    }

    static onDOMChange(newState) {
        return newState;
    }

    render() {
        return null;
    }
}

const reducePropsToState = (propsList) => ({
    title: getTitleFromPropsList(propsList),
    baseTag: getBaseTagFromPropsList(propsList),
    metaTags: getTagsFromPropsList(TAG_NAMES.META, [TAG_PROPERTIES.NAME, TAG_PROPERTIES.CHARSET, TAG_PROPERTIES.HTTPEQUIV], propsList),
    linkTags: getTagsFromPropsList(TAG_NAMES.LINK, [TAG_PROPERTIES.REL, TAG_PROPERTIES.HREF], propsList)
});

let clientState;
const handleClientStateChange = (newState) => {
    if (deepEqual(clientState, newState)) {
        return;
    }

    const {title, baseTag, metaTags, linkTags} = newState;
    updateTitle(title);
    updateTags(TAG_NAMES.LINK, linkTags);
    updateTags(TAG_NAMES.META, metaTags);
    updateTags(TAG_NAMES.BASE, baseTag);

    Helmet.onDOMChange(newState);

    // Caching state in order to check if client state should be updated
    clientState = newState;
};

const mapStateOnServer = ({title, baseTag, metaTags, linkTags}) => ({
    title: HTMLEntities.encode(title),
    base: generateTagsAsReactComponent(TAG_NAMES.BASE, baseTag),
    meta: generateTagsAsReactComponent(TAG_NAMES.META, metaTags),
    link: generateTagsAsReactComponent(TAG_NAMES.LINK, linkTags)
});

export {Helmet as HelmetComponent};
export default withSideEffect(
    reducePropsToState,
    handleClientStateChange,
    mapStateOnServer
)(Helmet);

