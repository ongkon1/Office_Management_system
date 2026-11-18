-- Safe only before requisitions have been released for business use.
DROP TRIGGER requisition_reviews_no_delete;
DROP TRIGGER requisition_reviews_no_update;
DROP TRIGGER requisition_new_kind_guard;
DROP TRIGGER requisition_in_house_kind_guard;
DROP TABLE requisition_reviews;
DROP TABLE requisition_new_details;
DROP TABLE requisition_in_house_details;
DROP TABLE requisitions;

