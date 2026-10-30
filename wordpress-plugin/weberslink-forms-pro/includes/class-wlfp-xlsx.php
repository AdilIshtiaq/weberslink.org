<?php
defined( 'ABSPATH' ) || exit;

/** Minimal XLSX writer (one sheet, bold frozen header row). Needs the PHP zip extension. */
class WLFP_Xlsx {

	public static function available() {
		return class_exists( 'ZipArchive' );
	}

	private static function esc( $s ) {
		$s = preg_replace( '/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', (string) $s );
		return htmlspecialchars( (string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8' );
	}

	public static function col( $i ) {
		$s = '';
		for ( $i++; $i > 0; $i = intdiv( $i - 1, 26 ) ) {
			$s = chr( 65 + ( $i - 1 ) % 26 ) . $s;
		}
		return $s;
	}

	/** $rows: array of arrays of scalars. First row is the header. Returns binary string or '' on failure. */
	public static function build( array $rows, $sheet = 'Entries' ) {
		if ( ! self::available() ) {
			return '';
		}
		$xml = '';
		foreach ( array_values( $rows ) as $r => $row ) {
			$xml .= '<row r="' . ( $r + 1 ) . '">';
			foreach ( array_values( $row ) as $c => $v ) {
				$ref = self::col( $c ) . ( $r + 1 );
				$st  = 0 === $r ? ' s="1"' : '';
				if ( '' === (string) $v ) {
					continue;
				}
				if ( 0 !== $r && is_numeric( $v ) && ! preg_match( '/^0\d|^[+-]?0\d|e/i', (string) $v ) && strlen( (string) $v ) <= 15 ) {
					$xml .= '<c r="' . $ref . '"' . $st . '><v>' . self::esc( $v ) . '</v></c>';
				} else {
					$xml .= '<c r="' . $ref . '"' . $st . ' t="inlineStr"><is><t xml:space="preserve">' . self::esc( $v ) . '</t></is></c>';
				}
			}
			$xml .= '</row>';
		}
		$name  = self::esc( mb_substr( preg_replace( '/[\\\\\/\?\*\[\]:]/', ' ', $sheet ), 0, 31 ) );
		$files = array(
			'[Content_Types].xml'        => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
			'_rels/.rels'                => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
			'xl/workbook.xml'            => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' . $name . '" sheetId="1" r:id="rId1"/></sheets></workbook>',
			'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
			'xl/styles.xml'              => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
			'xl/worksheets/sheet1.xml'   => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>' . $xml . '</sheetData></worksheet>',
		);
		$tmp = tempnam( sys_get_temp_dir(), 'wlfpx' );
		$zip = new ZipArchive();
		if ( true !== $zip->open( $tmp, ZipArchive::OVERWRITE ) ) {
			return '';
		}
		foreach ( $files as $n => $c ) {
			$zip->addFromString( $n, $c );
		}
		$zip->close();
		$bytes = (string) file_get_contents( $tmp ); // phpcs:ignore
		@unlink( $tmp ); // phpcs:ignore
		return $bytes;
	}
}
