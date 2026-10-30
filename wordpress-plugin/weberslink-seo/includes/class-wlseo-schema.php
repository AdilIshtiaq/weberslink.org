<?php
defined( 'ABSPATH' ) || exit;

/** JSON-LD graph builder (pure). */
class WLSEO_Schema {

	/**
	 * @param array $c site_url, site_name, search_url, org_type, org_name, org_logo, same_as(list),
	 *                 url, title, description, image, type (home|post|page|other), date, modified, author, crumbs (list of name,url)
	 */
	public static function graph( $c ) {
		$c    = array_merge( array( 'site_url' => '', 'site_name' => '', 'search_url' => '', 'org_type' => 'Organization', 'org_name' => '', 'org_logo' => '', 'same_as' => array(), 'url' => '', 'title' => '', 'description' => '', 'image' => '', 'type' => 'other', 'date' => '', 'modified' => '', 'author' => '', 'crumbs' => array(), 'lang' => '' ), $c );
		$site = rtrim( $c['site_url'], '/' ) . '/';
		$g    = array();
		$org  = '' !== $c['org_name'] ? $c['org_name'] : $c['site_name'];

		$website = array( '@type' => 'WebSite', '@id' => $site . '#website', 'url' => $site, 'name' => $c['site_name'], 'publisher' => array( '@id' => $site . '#org' ) );
		if ( '' !== $c['lang'] ) {
			$website['inLanguage'] = $c['lang'];
		}
		if ( '' !== $c['search_url'] ) {
			$website['potentialAction'] = array( '@type' => 'SearchAction', 'target' => array( '@type' => 'EntryPoint', 'urlTemplate' => $c['search_url'] ), 'query-input' => 'required name=search_term_string' );
		}
		$g[] = $website;

		$o = array( '@type' => 'Person' === $c['org_type'] ? 'Person' : 'Organization', '@id' => $site . '#org', 'name' => $org, 'url' => $site );
		if ( '' !== $c['org_logo'] ) {
			$o['logo'] = array( '@type' => 'ImageObject', 'url' => $c['org_logo'] );
			$o['image'] = array( '@id' => $site . '#org' );
		}
		if ( $c['same_as'] ) {
			$o['sameAs'] = array_values( $c['same_as'] );
		}
		$g[] = $o;

		if ( '' !== $c['url'] ) {
			$page = array( '@type' => 'WebPage', '@id' => $c['url'] . '#webpage', 'url' => $c['url'], 'name' => $c['title'], 'isPartOf' => array( '@id' => $site . '#website' ) );
			if ( '' !== $c['description'] ) {
				$page['description'] = $c['description'];
			}
			if ( '' !== $c['image'] ) {
				$page['primaryImageOfPage'] = array( '@type' => 'ImageObject', 'url' => $c['image'] );
			}
			if ( '' !== $c['date'] ) {
				$page['datePublished'] = $c['date'];
			}
			if ( '' !== $c['modified'] ) {
				$page['dateModified'] = $c['modified'];
			}
			if ( count( $c['crumbs'] ) > 1 ) {
				$page['breadcrumb'] = array( '@id' => $c['url'] . '#breadcrumb' );
			}
			$g[] = $page;
			if ( 'post' === $c['type'] ) {
				$art = array( '@type' => 'Article', '@id' => $c['url'] . '#article', 'isPartOf' => array( '@id' => $c['url'] . '#webpage' ), 'mainEntityOfPage' => array( '@id' => $c['url'] . '#webpage' ), 'headline' => $c['title'], 'publisher' => array( '@id' => $site . '#org' ) );
				if ( '' !== $c['author'] ) {
					$art['author'] = array( '@type' => 'Person', 'name' => $c['author'] );
				}
				if ( '' !== $c['image'] ) {
					$art['image'] = array( '@type' => 'ImageObject', 'url' => $c['image'] );
				}
				if ( '' !== $c['date'] ) {
					$art['datePublished'] = $c['date'];
				}
				if ( '' !== $c['modified'] ) {
					$art['dateModified'] = $c['modified'];
				}
				$g[] = $art;
			}
			if ( count( $c['crumbs'] ) > 1 ) {
				$items = array();
				foreach ( array_values( $c['crumbs'] ) as $i => $b ) {
					$items[] = array( '@type' => 'ListItem', 'position' => $i + 1, 'name' => $b[0], 'item' => $b[1] );
				}
				$g[] = array( '@type' => 'BreadcrumbList', '@id' => $c['url'] . '#breadcrumb', 'itemListElement' => $items );
			}
		}
		return array( '@context' => 'https://schema.org', '@graph' => $g );
	}

	/** JSON that is safe inside a <script> element (cannot close the tag or start a comment). */
	public static function encode( $graph ) {
		return json_encode( $graph, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ); // phpcs:ignore
	}
}
