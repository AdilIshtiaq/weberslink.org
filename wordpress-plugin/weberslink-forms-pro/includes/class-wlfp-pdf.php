<?php
defined( 'ABSPATH' ) || exit;

/**
 * Tiny dependency-free PDF writer (A4, Helvetica, Latin-1 text). Used for entry PDFs and e-mail attachments.
 * Characters outside Windows-1252 are transliterated or dropped.
 */
class WLFP_Pdf {

	private $pages = array();
	private $cur   = '';
	private $y     = 0;
	private $w     = 595;
	private $h     = 842;
	private $m     = 50;

	/** Helvetica advance widths for ASCII 32-126 (1000 units/em). */
	private static $widths = array( 278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584 );

	public static function to_latin( $s ) {
		$s = (string) $s;
		$s = str_replace( array( "\xE2\x80\x99", "\xE2\x80\x98", "\xE2\x80\x9C", "\xE2\x80\x9D", "\xE2\x80\x93", "\xE2\x80\x94", "\xE2\x80\xA6", "\xE2\x86\x92" ), array( "'", "'", '"', '"', '-', '-', '...', '->' ), $s );
		if ( function_exists( 'iconv' ) ) {
			$o = @iconv( 'UTF-8', 'CP1252//TRANSLIT//IGNORE', $s ); // phpcs:ignore
			if ( false !== $o ) {
				return $o;
			}
		}
		return function_exists( 'mb_convert_encoding' ) ? mb_convert_encoding( $s, 'ISO-8859-1', 'UTF-8' ) : preg_replace( '/[^\x20-\x7E\n]/', '?', $s );
	}

	private function width( $text, $size ) {
		$w = 0;
		$n = strlen( $text );
		for ( $i = 0; $i < $n; $i++ ) {
			$c  = ord( $text[ $i ] );
			$w += ( $c >= 32 && $c <= 126 ) ? self::$widths[ $c - 32 ] : 556;
		}
		return $w * $size / 1000;
	}

	private function esc( $s ) {
		return str_replace( array( '\\', '(', ')', "\r" ), array( '\\\\', '\\(', '\\)', '' ), $s );
	}

	private function new_page() {
		if ( '' !== $this->cur ) {
			$this->pages[] = $this->cur;
		}
		$this->cur = '';
		$this->y   = $this->h - $this->m;
	}

	/** Greedy word wrap to a pixel width. */
	private function wrap( $text, $size, $max ) {
		$lines = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $text ) as $para ) {
			$line = '';
			foreach ( preg_split( '/(\s+)/', $para, -1, PREG_SPLIT_NO_EMPTY ) as $word ) {
				while ( $this->width( $word, $size ) > $max ) { // very long token: hard split.
					$cut = strlen( $word );
					while ( $cut > 1 && $this->width( substr( $word, 0, $cut ), $size ) > $max ) {
						$cut--;
					}
					if ( '' !== $line ) {
						$lines[] = $line;
						$line    = '';
					}
					$lines[] = substr( $word, 0, $cut );
					$word    = substr( $word, $cut );
				}
				$try = '' === $line ? $word : $line . ' ' . $word;
				if ( $this->width( $try, $size ) <= $max ) {
					$line = $try;
				} else {
					$lines[] = $line;
					$line    = $word;
				}
			}
			$lines[] = $line;
		}
		return $lines;
	}

	/** Write text lines. $font 1 = regular, 2 = bold. */
	public function text( $text, $size = 10, $font = 1, $x = null, $gap = 3, $gray = 0 ) {
		$x     = null === $x ? $this->m : $x;
		$text  = self::to_latin( $text );
		$lead  = $size * 1.35;
		$lines = $this->wrap( $text, $size, $this->w - $this->m - $x );
		foreach ( $lines as $l ) {
			if ( ! $this->pages && '' === $this->cur ) {
				$this->new_page();
			}
			if ( $this->y - $lead < $this->m ) {
				$this->new_page();
			}
			$this->y   -= $lead;
			$this->cur .= sprintf( "BT /F%d %s Tf %s g %s %s Td (%s) Tj ET\n", $font, $size, $gray, round( $x, 2 ), round( $this->y, 2 ), $this->esc( $l ) );
		}
		$this->y -= $gap;
	}

	public function rule() {
		if ( ! $this->pages && '' === $this->cur ) {
			$this->new_page();
		}
		$this->y   -= 4;
		$this->cur .= sprintf( "0.8 G 0.5 w %s %s m %s %s l S\n", $this->m, round( $this->y, 2 ), $this->w - $this->m, round( $this->y, 2 ) );
		$this->y   -= 8;
	}

	public function output() {
		if ( '' !== $this->cur || ! $this->pages ) {
			$this->pages[] = $this->cur;
		}
		$objs   = array();
		$objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
		$n      = count( $this->pages );
		$kids   = array();
		for ( $i = 0; $i < $n; $i++ ) {
			$kids[] = ( 5 + $i * 2 ) . ' 0 R';
		}
		$objs[2] = '<< /Type /Pages /Kids [' . implode( ' ', $kids ) . '] /Count ' . $n . ' >>';
		$objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
		$objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
		foreach ( $this->pages as $i => $content ) {
			$pid = 5 + $i * 2;
			$cid = $pid + 1;
			// Footer with page number.
			$content .= sprintf( "BT /F1 8 Tf 0.5 g %s 28 Td (%s) Tj ET\n", $this->m, $this->esc( sprintf( 'Page %d of %d', $i + 1, $n ) ) );
			$objs[ $pid ] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' . $this->w . ' ' . $this->h . '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' . $cid . ' 0 R >>';
			$objs[ $cid ] = "<< /Length " . strlen( $content ) . " >>\nstream\n" . $content . "endstream";
		}
		ksort( $objs );
		$out     = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
		$offsets = array();
		foreach ( $objs as $id => $body ) {
			$offsets[ $id ] = strlen( $out );
			$out           .= $id . " 0 obj\n" . $body . "\nendobj\n";
		}
		$xref = strlen( $out );
		$max  = max( array_keys( $objs ) );
		$out .= "xref\n0 " . ( $max + 1 ) . "\n0000000000 65535 f \n";
		for ( $i = 1; $i <= $max; $i++ ) {
			$out .= sprintf( "%010d 00000 n \n", isset( $offsets[ $i ] ) ? $offsets[ $i ] : 0 );
		}
		$out .= "trailer\n<< /Size " . ( $max + 1 ) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";
		return $out;
	}

	/** Builds a PDF of one entry. Returns array( filename, bytes ). */
	public static function entry( $form, $entry ) {
		$p = new self();
		$p->text( $form['title'], 18, 2, null, 2 );
		$ref = WLFP_Merge::reference( $form, $entry );
		$p->text( ( $ref ? $ref . '  |  ' : '' ) . get_date_from_gmt( $entry['created_at'], 'Y-m-d H:i' ) . ( ! empty( $entry['ip'] ) ? '  |  ' . $entry['ip'] : '' ), 9, 1, null, 4, 0.4 );
		$p->rule();
		foreach ( WLFP_Forms::value_fields( $form ) as $f ) {
			if ( empty( $entry['data'][ $f['name'] ] ) || WLFP_Fields::is_empty( $entry['data'][ $f['name'] ] ) || in_array( $f['type'], array( 'password' ), true ) ) {
				continue;
			}
			$v = in_array( $f['type'], array( 'signature' ), true ) ? '[signature on file]' : WLFP_Fields::format_value( $f, $entry['data'][ $f['name'] ], false );
			$p->text( $f['label'] ? $f['label'] : $f['name'], 9, 2, null, 0, 0.35 );
			$p->text( $v, 11, 1, $p->m + 8, 7 );
		}
		if ( ! empty( $entry['data']['_payment']['lines'] ) ) {
			$pay = $entry['data']['_payment'];
			$p->rule();
			$p->text( __( 'Order', 'weberslink-forms-pro' ), 12, 2, null, 3 );
			foreach ( $pay['lines'] as $l ) {
				$p->text( $l['label'] . ' x ' . (int) $l['qty'] . ' - ' . WLFP_Helpers::money( $l['amount'], $entry['currency'] ), 10, 1, $p->m + 8, 2 );
			}
			if ( $pay['discount'] ) {
				$p->text( __( 'Discount', 'weberslink-forms-pro' ) . ': -' . WLFP_Helpers::money( $pay['discount'], $entry['currency'] ), 10, 1, $p->m + 8, 2 );
			}
			if ( $pay['tax'] ) {
				$p->text( __( 'Tax', 'weberslink-forms-pro' ) . ': ' . WLFP_Helpers::money( $pay['tax'], $entry['currency'] ), 10, 1, $p->m + 8, 2 );
			}
			$p->text( __( 'Total', 'weberslink-forms-pro' ) . ': ' . WLFP_Helpers::money( $pay['total'], $entry['currency'] ) . ' (' . $entry['payment_status'] . ')', 11, 2, $p->m + 8, 4 );
		}
		if ( ! empty( $entry['data']['_quiz'] ) ) {
			$q = $entry['data']['_quiz'];
			$p->rule();
			$p->text( __( 'Quiz score', 'weberslink-forms-pro' ) . ': ' . $q['score'] . ' / ' . $q['max'] . ' (' . $q['percent'] . '%) - ' . ( ! empty( $q['passed'] ) ? __( 'Passed', 'weberslink-forms-pro' ) : __( 'Not passed', 'weberslink-forms-pro' ) ), 11, 2 );
		}
		$name = sanitize_file_name( ( $ref ? $ref : $form['title'] . '-' . ( isset( $entry['serial'] ) ? $entry['serial'] : $entry['id'] ) ) . '.pdf' );
		return array( $name, $p->output() );
	}
}
