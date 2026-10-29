<?php
defined( 'ABSPATH' ) || exit;

/** Ready-made form templates. */
class WLFP_Templates {

	private static function f( $type, $name, $label, $o = array() ) {
		return array_merge( WLFP_Fields::defaults( $type ), array( 'name' => $name, 'label' => $label ), $o );
	}

	private static function opts( $list ) {
		$o = array();
		foreach ( $list as $l ) {
			$o[] = array( 'label' => $l, 'value' => sanitize_title( $l ), 'price' => '' );
		}
		return $o;
	}

	public static function all() {
		$T = array();

		$T['blank'] = array( 'title' => __( 'Blank form', 'weberslink-forms-pro' ), 'desc' => __( 'Start from scratch.', 'weberslink-forms-pro' ), 'fields' => array(), 'settings' => array() );

		$T['contact'] = array( 'title' => __( 'Contact form', 'weberslink-forms-pro' ), 'desc' => __( 'Name, email, subject and message.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
			self::f( 'text', 'subject', 'Subject', array( 'required' => 1 ) ),
			self::f( 'textarea', 'message', 'Message', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'button' => array( 'text' => 'Send message' ) ) );

		$T['quote'] = array( 'title' => __( 'Quote / project request', 'weberslink-forms-pro' ), 'desc' => __( 'Multi-step request with budget and file upload.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Work email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'text', 'company', 'Company', array( 'width' => 'half' ) ),
			self::f( 'page_break', 'pb1', 'Project', array( 'step_title' => 'Project' ) ),
			self::f( 'checkbox', 'services', 'What do you need?', array( 'options' => self::opts( array( 'Web design', 'Development', 'SEO', 'Branding', 'Marketing' ) ), 'required' => 1 ) ),
			self::f( 'select', 'budget', 'Budget', array( 'options' => self::opts( array( 'Under $2k', '$2k – $5k', '$5k – $10k', '$10k+' ) ) ) ),
			self::f( 'date', 'deadline', 'Ideal launch date', array( 'width' => 'half' ) ),
			self::f( 'page_break', 'pb2', 'Details', array( 'step_title' => 'Details' ) ),
			self::f( 'textarea', 'details', 'Tell us about the project', array( 'required' => 1 ) ),
			self::f( 'file', 'brief', 'Attach a brief (optional)', array( 'max_files' => 3 ) ),
			self::f( 'consent', 'consent', '', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'button' => array( 'text' => 'Request quote' ) ) );

		$T['newsletter'] = array( 'title' => __( 'Newsletter signup', 'weberslink-forms-pro' ), 'desc' => __( 'Email capture with consent.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'email', 'email', 'Email address', array( 'required' => 1, 'placeholder' => 'you@example.com' ) ),
			self::f( 'consent', 'consent', '', array( 'terms' => 'Yes, send me updates. I can unsubscribe at any time.', 'required' => 1 ) ),
		), 'settings' => array( 'button' => array( 'text' => 'Subscribe' ), 'confirmation' => array( 'message' => '<p>You\'re on the list. Thanks!</p>' ) ) );

		$T['feedback'] = array( 'title' => __( 'Customer feedback', 'weberslink-forms-pro' ), 'desc' => __( 'Rating, NPS and comments.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'rating', 'rating', 'How was your experience?', array( 'required' => 1 ) ),
			self::f( 'nps', 'nps', 'How likely are you to recommend us?' ),
			self::f( 'radio', 'liked', 'What did you like most?', array( 'options' => self::opts( array( 'Quality', 'Speed', 'Support', 'Price' ) ), 'other' => 1 ) ),
			self::f( 'textarea', 'comments', 'Any other comments?' ),
			self::f( 'email', 'email', 'Email (optional, if you\'d like a reply)' ),
		), 'settings' => array() );

		$T['survey'] = array( 'title' => __( 'Satisfaction survey (matrix)', 'weberslink-forms-pro' ), 'desc' => __( 'Likert grid + slider.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'likert', 'satisfaction', 'Please rate the following', array( 'rows_list' => array( array( 'label' => 'Ease of use', 'value' => 'ease' ), array( 'label' => 'Design', 'value' => 'design' ), array( 'label' => 'Value for money', 'value' => 'value' ), array( 'label' => 'Support', 'value' => 'support' ) ), 'required' => 1 ) ),
			self::f( 'range', 'recommend', 'Overall satisfaction (0–100)', array( 'min' => 0, 'max' => 100, 'default' => 70 ) ),
			self::f( 'textarea', 'improve', 'What could we improve?' ),
		), 'settings' => array() );

		$T['registration'] = array( 'title' => __( 'User registration', 'weberslink-forms-pro' ), 'desc' => __( 'Creates a WordPress user on submit.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'text', 'username', 'Username', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'password', 'password', 'Password', array( 'required' => 1 ) ),
			self::f( 'consent', 'consent', '', array( 'required' => 1 ) ),
		), 'settings' => array( 'feeds' => array( array( 'type' => 'user_registration', 'name' => 'Create user', 'enabled' => 1, 'email' => '{field:email}', 'username' => '{field:username}', 'password' => '{field:password}', 'first_name' => '{field:name:first}', 'last_name' => '{field:name:last}', 'role' => 'subscriber', 'notify' => 0 ) ) ) );

		$T['job'] = array( 'title' => __( 'Job application', 'weberslink-forms-pro' ), 'desc' => __( 'Applicant details, CV upload.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Full name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
			self::f( 'select', 'position', 'Position', array( 'options' => self::opts( array( 'Designer', 'Developer', 'Marketer', 'Other' ) ), 'required' => 1 ) ),
			self::f( 'url', 'portfolio', 'Portfolio / LinkedIn' ),
			self::f( 'file', 'cv', 'CV / Résumé', array( 'allowed' => 'pdf,doc,docx', 'required' => 1 ) ),
			self::f( 'textarea', 'cover', 'Cover letter' ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'button' => array( 'text' => 'Apply' ) ) );

		$T['rsvp'] = array( 'title' => __( 'Event RSVP', 'weberslink-forms-pro' ), 'desc' => __( 'Guests, meal choice, conditional questions.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'radio', 'attending', 'Will you attend?', array( 'options' => array( array( 'label' => 'Yes', 'value' => 'yes', 'price' => '' ), array( 'label' => 'No', 'value' => 'no', 'price' => '' ) ), 'required' => 1, 'layout' => 'horizontal' ) ),
			self::f( 'number', 'guests', 'Number of guests', array( 'min' => 0, 'max' => 10, 'conditional' => array( 'enabled' => 1, 'match' => 'all', 'rules' => array( array( 'field' => 'attending', 'op' => 'eq', 'value' => 'yes' ) ) ) ) ),
			self::f( 'select', 'meal', 'Meal preference', array( 'options' => self::opts( array( 'Vegetarian', 'Vegan', 'Chicken', 'Beef' ) ), 'conditional' => array( 'enabled' => 1, 'match' => 'all', 'rules' => array( array( 'field' => 'attending', 'op' => 'eq', 'value' => 'yes' ) ) ) ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['order'] = array( 'title' => __( 'Order / payment form', 'weberslink-forms-pro' ), 'desc' => __( 'Product, quantity, coupon and order summary (Stripe/PayPal).', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'payment_item', 'plan', 'Choose a package', array( 'kind' => 'radio', 'required' => 1, 'options' => array( array( 'label' => 'Starter', 'value' => 'starter', 'price' => '49' ), array( 'label' => 'Growth', 'value' => 'growth', 'price' => '99' ), array( 'label' => 'Scale', 'value' => 'scale', 'price' => '199' ) ) ) ),
			self::f( 'coupon', 'coupon', 'Coupon code' ),
			self::f( 'payment_summary', 'summary', 'Order summary' ),
		), 'settings' => array( 'payment' => array( 'provider' => 'stripe' ), 'button' => array( 'text' => 'Pay now' ), 'notifications' => array( self::notify( '{field:email}' ) ) ) );


		/* ---- Additional templates ---- */
		$yes = array( 'enabled' => 1, 'match' => 'all', 'rules' => array() );
		$T['appointment'] = array( 'title' => __( 'Appointment booking', 'weberslink-forms-pro' ), 'desc' => __( 'Date, time slot and service.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'select', 'service', 'Service', array( 'options' => self::opts( array( 'Consultation', 'Follow-up', 'Other' ) ), 'required' => 1 ) ),
			self::f( 'date', 'date', 'Preferred date', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'select', 'time', 'Preferred time', array( 'options' => self::opts( array( '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM' ) ), 'required' => 1, 'width' => 'half' ) ),
			self::f( 'textarea', 'notes', 'Anything we should know?' ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Your appointment request' ) ), 'button' => array( 'text' => 'Request appointment' ) ) );

		$T['tour'] = array( 'title' => __( 'Property / home tour request', 'weberslink-forms-pro' ), 'desc' => __( 'Real-estate tour scheduling with budget and timeline.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'text', 'property', 'Property address or listing ID' ),
			self::f( 'radio', 'tour_type', 'Tour type', array( 'options' => self::opts( array( 'In person', 'Video tour' ) ), 'layout' => 'horizontal', 'required' => 1 ) ),
			self::f( 'date', 'date', 'Preferred date', array( 'width' => 'half' ) ),
			self::f( 'select', 'time', 'Preferred time', array( 'options' => self::opts( array( 'Morning', 'Afternoon', 'Evening' ) ), 'width' => 'half' ) ),
			self::f( 'select', 'timeline', 'When are you planning to move?', array( 'options' => self::opts( array( 'Immediately', '1–3 months', '3–6 months', 'Just browsing' ) ) ) ),
			self::f( 'textarea', 'notes', 'Questions or must-haves' ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Your tour request' ) ), 'button' => array( 'text' => 'Request tour' ) ) );

		$T['support'] = array( 'title' => __( 'Support ticket', 'weberslink-forms-pro' ), 'desc' => __( 'Priority, category and attachment.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'select', 'category', 'Category', array( 'options' => self::opts( array( 'Billing', 'Technical issue', 'Account', 'Other' ) ), 'required' => 1, 'width' => 'half' ) ),
			self::f( 'select', 'priority', 'Priority', array( 'options' => self::opts( array( 'Low', 'Normal', 'High', 'Urgent' ) ), 'width' => 'half' ) ),
			self::f( 'text', 'subject', 'Subject', array( 'required' => 1 ) ),
			self::f( 'textarea', 'message', 'Describe the problem', array( 'required' => 1 ) ),
			self::f( 'file', 'attachment', 'Screenshot or file', array( 'max_files' => 3 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'We received your support request' ) ) ) );

		$T['bug'] = array( 'title' => __( 'Bug report', 'weberslink-forms-pro' ), 'desc' => __( 'Steps to reproduce, severity, browser.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'email', 'email', 'Your email', array( 'required' => 1 ) ),
			self::f( 'text', 'title', 'Short summary', array( 'required' => 1 ) ),
			self::f( 'textarea', 'steps', 'Steps to reproduce', array( 'required' => 1 ) ),
			self::f( 'textarea', 'expected', 'What did you expect to happen?', array( 'width' => 'half' ) ),
			self::f( 'textarea', 'actual', 'What happened instead?', array( 'width' => 'half' ) ),
			self::f( 'radio', 'severity', 'Severity', array( 'options' => self::opts( array( 'Minor', 'Major', 'Blocker' ) ), 'layout' => 'horizontal' ) ),
			self::f( 'image', 'screenshot', 'Screenshot' ),
		), 'settings' => array() );

		$T['callback'] = array( 'title' => __( 'Request a callback', 'weberslink-forms-pro' ), 'desc' => __( 'Short form: phone and best time.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'text', 'name', 'Name', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone number', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'select', 'when', 'Best time to call', array( 'options' => self::opts( array( 'Morning', 'Afternoon', 'Evening', 'Any time' ) ) ) ),
			self::f( 'consent', 'consent', '', array( 'terms' => 'You may contact me by phone about my request.', 'required' => 1 ) ),
		), 'settings' => array( 'button' => array( 'text' => 'Call me back' ) ) );

		$T['lead'] = array( 'title' => __( 'Lead capture (multi-step)', 'weberslink-forms-pro' ), 'desc' => __( 'Qualifying questions across 3 steps with progress bar.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'radio', 'interest', 'What are you looking for?', array( 'options' => self::opts( array( 'A new website', 'SEO / marketing', 'Maintenance', 'Something else' ) ), 'required' => 1 ) ),
			self::f( 'page_break', 'pb1', 'Next', array( 'step_title' => 'Your goal' ) ),
			self::f( 'select', 'budget', 'Budget', array( 'options' => self::opts( array( 'Under $1k', '$1k – $5k', '$5k – $15k', '$15k+' ) ), 'required' => 1 ) ),
			self::f( 'select', 'timeline', 'Timeline', array( 'options' => self::opts( array( 'ASAP', '1–3 months', 'Flexible' ) ) ) ),
			self::f( 'page_break', 'pb2', 'Next', array( 'step_title' => 'Details' ) ),
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ), 'steps' => array( 'first_title' => 'Interest' ) ) );

		$T['partner'] = array( 'title' => __( 'Partnership inquiry', 'weberslink-forms-pro' ), 'desc' => __( 'Company, website and proposal.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'text', 'company', 'Company', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'url', 'website', 'Website', array( 'width' => 'half' ) ),
			self::f( 'name', 'name', 'Contact person', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'checkbox', 'type', 'Partnership type', array( 'options' => self::opts( array( 'Reseller', 'Affiliate', 'Sponsorship', 'Integration' ) ) ) ),
			self::f( 'textarea', 'proposal', 'Tell us your idea', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['testimonial'] = array( 'title' => __( 'Testimonial / review', 'weberslink-forms-pro' ), 'desc' => __( 'Star rating, review and photo.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'rating', 'rating', 'Your rating', array( 'required' => 1 ) ),
			self::f( 'text', 'headline', 'Headline' ),
			self::f( 'textarea', 'review', 'Your review', array( 'required' => 1 ) ),
			self::f( 'name', 'name', 'Name', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'email', 'email', 'Email (not shown publicly)', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'image', 'photo', 'Your photo (optional)' ),
			self::f( 'consent', 'consent', '', array( 'terms' => 'You may publish my review on your website.', 'required' => 1 ) ),
		), 'settings' => array() );

		$T['nps'] = array( 'title' => __( 'NPS survey', 'weberslink-forms-pro' ), 'desc' => __( '0–10 score with a follow-up that depends on the answer.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'nps', 'score', 'How likely are you to recommend us to a friend or colleague?', array( 'required' => 1 ) ),
			self::f( 'textarea', 'why_low', 'Sorry to hear that. What went wrong?', array( 'conditional' => array( 'enabled' => 1, 'match' => 'all', 'rules' => array( array( 'field' => 'score', 'op' => 'lte', 'value' => '6' ) ) ) ) ),
			self::f( 'textarea', 'why_high', 'Great! What do you like most?', array( 'conditional' => array( 'enabled' => 1, 'match' => 'all', 'rules' => array( array( 'field' => 'score', 'op' => 'gte', 'value' => '9' ) ) ) ) ),
		), 'settings' => array( 'button' => array( 'text' => 'Send feedback' ) ) );

		$T['course'] = array( 'title' => __( 'Course / class registration', 'weberslink-forms-pro' ), 'desc' => __( 'Student details, course choice, schedule.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Student name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
			self::f( 'date', 'dob', 'Date of birth', array( 'width' => 'half' ) ),
			self::f( 'select', 'course', 'Course', array( 'options' => self::opts( array( 'Beginner', 'Intermediate', 'Advanced' ) ), 'required' => 1, 'width' => 'half' ) ),
			self::f( 'checkbox', 'days', 'Available days', array( 'options' => self::opts( array( 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat' ) ), 'layout' => 'horizontal' ) ),
			self::f( 'address', 'address', 'Address' ),
			self::f( 'consent', 'consent', '', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Registration received' ) ) ) );

		$T['membership'] = array( 'title' => __( 'Membership application', 'weberslink-forms-pro' ), 'desc' => __( 'Applicant info, membership level, signature.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Full name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'width' => 'half' ) ),
			self::f( 'address', 'address', 'Address' ),
			self::f( 'radio', 'level', 'Membership level', array( 'options' => self::opts( array( 'Individual', 'Family', 'Corporate' ) ), 'required' => 1 ) ),
			self::f( 'textarea', 'about', 'Why would you like to join?' ),
			self::f( 'signature', 'signature', 'Signature', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['volunteer'] = array( 'title' => __( 'Volunteer sign-up', 'weberslink-forms-pro' ), 'desc' => __( 'Skills, availability and emergency contact.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'checkbox', 'areas', 'Where would you like to help?', array( 'options' => self::opts( array( 'Events', 'Fundraising', 'Admin', 'Outreach' ) ) ) ),
			self::f( 'checkbox', 'availability', 'Availability', array( 'options' => self::opts( array( 'Weekday mornings', 'Weekday evenings', 'Weekends' ) ) ) ),
			self::f( 'text', 'emergency', 'Emergency contact (name & phone)' ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['reservation'] = array( 'title' => __( 'Restaurant reservation', 'weberslink-forms-pro' ), 'desc' => __( 'Party size, date, time and occasion.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'phone', 'phone', 'Phone', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'number', 'party', 'Party size', array( 'min' => 1, 'max' => 20, 'default' => 2, 'required' => 1, 'width' => 'third' ) ),
			self::f( 'date', 'date', 'Date', array( 'required' => 1, 'width' => 'third' ) ),
			self::f( 'time', 'time', 'Time', array( 'required' => 1, 'width' => 'third' ) ),
			self::f( 'select', 'occasion', 'Occasion', array( 'options' => self::opts( array( 'None', 'Birthday', 'Anniversary', 'Business' ) ) ) ),
			self::f( 'textarea', 'requests', 'Dietary needs / special requests' ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Your reservation request' ) ) ) );

		$T['contest'] = array( 'title' => __( 'Photo contest entry', 'weberslink-forms-pro' ), 'desc' => __( 'Image upload, caption and rules consent.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'image', 'photo', 'Your photo', array( 'required' => 1, 'max_size' => 10 ) ),
			self::f( 'text', 'caption', 'Caption', array( 'maxlength' => 120 ) ),
			self::f( 'consent', 'rules', '', array( 'terms' => 'I accept the contest rules.', 'required' => 1 ) ),
		), 'settings' => array() );

		$T['refund'] = array( 'title' => __( 'Refund / return request', 'weberslink-forms-pro' ), 'desc' => __( 'Order number, reason and resolution.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'text', 'order', 'Order number', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'email', 'email', 'Email used for the order', array( 'required' => 1, 'width' => 'half' ) ),
			self::f( 'select', 'reason', 'Reason', array( 'options' => self::opts( array( 'Damaged', 'Wrong item', 'Not as described', 'Changed my mind', 'Other' ) ), 'required' => 1 ) ),
			self::f( 'radio', 'resolution', 'Preferred resolution', array( 'options' => self::opts( array( 'Refund', 'Replacement', 'Store credit' ) ), 'layout' => 'horizontal' ) ),
			self::f( 'textarea', 'details', 'Details' ),
			self::f( 'file', 'proof', 'Photos (optional)', array( 'max_files' => 4 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Your return request' ) ) ) );

		$T['donation'] = array( 'title' => __( 'Donation form', 'weberslink-forms-pro' ), 'desc' => __( 'Preset or custom amount (Stripe/PayPal).', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'payment_item', 'amount', 'Donation amount', array( 'kind' => 'radio', 'required' => 1, 'options' => array( array( 'label' => '$10', 'value' => '10', 'price' => '10' ), array( 'label' => '$25', 'value' => '25', 'price' => '25' ), array( 'label' => '$50', 'value' => '50', 'price' => '50' ), array( 'label' => '$100', 'value' => '100', 'price' => '100' ) ), 'layout' => 'horizontal' ) ),
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email (for your receipt)', array( 'required' => 1 ) ),
			self::f( 'textarea', 'message', 'Message (optional)' ),
			self::f( 'payment_summary', 'summary', 'Summary' ),
		), 'settings' => array( 'payment' => array( 'provider' => 'stripe', 'description' => 'Donation — {form_title}' ), 'button' => array( 'text' => 'Donate' ), 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Thank you for your donation' ) ) ) );

		$T['tickets'] = array( 'title' => __( 'Event tickets', 'weberslink-forms-pro' ), 'desc' => __( 'Ticket types, quantity, coupon and total.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'payment_item', 'ticket', 'Ticket type', array( 'kind' => 'select', 'required' => 1, 'options' => array( array( 'label' => 'General admission', 'value' => 'general', 'price' => '25' ), array( 'label' => 'VIP', 'value' => 'vip', 'price' => '60' ) ) ) ),
			self::f( 'quantity', 'qty', 'Number of tickets', array( 'item' => 'ticket', 'min' => 1, 'max' => 10, 'default' => 1 ) ),
			self::f( 'coupon', 'coupon', 'Coupon code' ),
			self::f( 'payment_summary', 'summary', 'Order summary' ),
		), 'settings' => array( 'payment' => array( 'provider' => 'stripe' ), 'button' => array( 'text' => 'Buy tickets' ), 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'Your tickets' ) ) ) );

		$T['service_order'] = array( 'title' => __( 'Service order with add-ons', 'weberslink-forms-pro' ), 'desc' => __( 'Package + checkbox add-ons + live total.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'payment_item', 'package', 'Package', array( 'kind' => 'radio', 'required' => 1, 'options' => array( array( 'label' => 'Basic', 'value' => 'basic', 'price' => '99' ), array( 'label' => 'Pro', 'value' => 'pro', 'price' => '199' ) ) ) ),
			self::f( 'payment_item', 'addons', 'Add-ons', array( 'kind' => 'checkbox', 'options' => array( array( 'label' => 'Rush delivery', 'value' => 'rush', 'price' => '49' ), array( 'label' => 'Extra revision', 'value' => 'rev', 'price' => '29' ) ) ) ),
			self::f( 'payment_summary', 'summary', 'Order summary' ),
		), 'settings' => array( 'payment' => array( 'provider' => 'stripe' ), 'button' => array( 'text' => 'Place order' ), 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['estimator'] = array( 'title' => __( 'Price estimator (calculation)', 'weberslink-forms-pro' ), 'desc' => __( 'Live calculated estimate from the visitor\'s inputs.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'number', 'pages', 'Number of pages', array( 'min' => 1, 'max' => 200, 'default' => 5, 'required' => 1 ) ),
			self::f( 'range', 'complexity', 'Complexity (1–5)', array( 'min' => 1, 'max' => 5, 'step' => 1, 'default' => 3 ) ),
			self::f( 'calculation', 'estimate', 'Estimated price', array( 'formula' => '{pages} * 120 * (0.6 + {complexity} * 0.2)', 'prefix' => '$', 'decimals' => 0 ) ),
			self::f( 'email', 'email', 'Email me this estimate', array( 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ) ) ) );

		$T['quiz'] = array( 'title' => __( 'Quick quiz / assessment', 'weberslink-forms-pro' ), 'desc' => __( 'Multiple-choice questions to collect answers.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Your name', array( 'required' => 1 ) ),
			self::f( 'radio', 'q1', '1. Which of these is a primary colour?', array( 'options' => self::opts( array( 'Green', 'Red', 'Orange', 'Purple' ) ), 'required' => 1 ) ),
			self::f( 'radio', 'q2', '2. How many days are in a leap year?', array( 'options' => self::opts( array( '364', '365', '366', '367' ) ), 'required' => 1 ) ),
			self::f( 'checkbox', 'q3', '3. Select all even numbers', array( 'options' => self::opts( array( '2', '3', '4', '7' ) ) ) ),
		), 'settings' => array() );

		$T['gdpr'] = array( 'title' => __( 'GDPR data request', 'weberslink-forms-pro' ), 'desc' => __( 'Access / delete / correct my data.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'name', 'name', 'Full name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email associated with your data', array( 'required' => 1 ) ),
			self::f( 'radio', 'request', 'Request type', array( 'options' => self::opts( array( 'Access my data', 'Correct my data', 'Delete my data', 'Export my data' ) ), 'required' => 1 ) ),
			self::f( 'textarea', 'details', 'Details' ),
			self::f( 'consent', 'verify', '', array( 'terms' => 'I confirm I am the person these details relate to.', 'required' => 1 ) ),
		), 'settings' => array( 'notifications' => array( self::notify( '{field:email}' ), self::autoreply( 'We received your data request' ) ) ) );

		$T['simple'] = array( 'title' => __( 'Simple contact (3 fields)', 'weberslink-forms-pro' ), 'desc' => __( 'Name, email, message. Nothing else.', 'weberslink-forms-pro' ), 'fields' => array(
			self::f( 'text', 'name', 'Name', array( 'required' => 1 ) ),
			self::f( 'email', 'email', 'Email', array( 'required' => 1 ) ),
			self::f( 'textarea', 'message', 'Message', array( 'required' => 1 ) ),
		), 'settings' => array( 'button' => array( 'text' => 'Send' ) ) );

		foreach ( self::categories_map() as $slug => $cat ) {
			if ( isset( $T[ $slug ] ) ) {
				$T[ $slug ]['cat'] = $cat;
			}
		}

		return apply_filters( 'wlfp_templates', $T );
	}


	public static function categories() {
		return array(
			'all'     => __( 'All', 'weberslink-forms-pro' ),
			'contact' => __( 'Contact & leads', 'weberslink-forms-pro' ),
			'booking' => __( 'Booking & events', 'weberslink-forms-pro' ),
			'payment' => __( 'Payments & orders', 'weberslink-forms-pro' ),
			'survey'  => __( 'Surveys & feedback', 'weberslink-forms-pro' ),
			'signup'  => __( 'Sign-ups & applications', 'weberslink-forms-pro' ),
			'support' => __( 'Support & requests', 'weberslink-forms-pro' ),
		);
	}

	public static function categories_map() {
		return array(
			'blank' => 'contact', 'contact' => 'contact', 'simple' => 'contact', 'quote' => 'contact', 'newsletter' => 'contact', 'callback' => 'contact', 'lead' => 'contact', 'partner' => 'contact', 'estimator' => 'contact',
			'appointment' => 'booking', 'tour' => 'booking', 'rsvp' => 'booking', 'reservation' => 'booking', 'tickets' => 'payment',
			'order' => 'payment', 'donation' => 'payment', 'service_order' => 'payment',
			'feedback' => 'survey', 'survey' => 'survey', 'nps' => 'survey', 'testimonial' => 'survey', 'quiz' => 'survey',
			'registration' => 'signup', 'job' => 'signup', 'course' => 'signup', 'membership' => 'signup', 'volunteer' => 'signup', 'contest' => 'signup',
			'support' => 'support', 'bug' => 'support', 'refund' => 'support', 'gdpr' => 'support',
		);
	}

	private static function autoreply( $subject ) {
		$n                = WLFP_Forms::default_settings()['notifications'][0];
		$n['name']        = 'Confirmation to visitor';
		$n['to']          = '{field:email}';
		$n['subject']     = $subject;
		$n['message']     = '<p>Hi {field:name},</p><p>Thanks for getting in touch with {site_name}. We have received your submission and will get back to you shortly.</p><p>Here is a copy of what you sent:</p>{all_data}';
		$n['reply_to']    = '{admin_email}';
		return $n;
	}

	private static function notify( $reply ) {
		$n                = WLFP_Forms::default_settings()['notifications'][0];
		$n['reply_to']    = $reply;
		return $n;
	}

	public static function create( $slug ) {
		$all = self::all();
		$t   = isset( $all[ $slug ] ) ? $all[ $slug ] : $all['blank'];
		return WLFP_Forms::save( 0, array( 'title' => 'blank' === $slug ? __( 'New form', 'weberslink-forms-pro' ) : $t['title'], 'status' => 'published', 'fields' => $t['fields'], 'settings' => array_replace_recursive( WLFP_Forms::default_settings(), $t['settings'] ) ) );
	}
}
