package com.eggworld.dto;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;
import java.util.Collections;
import static org.junit.jupiter.api.Assertions.*;
class TaskSecurityValidationTest {
 @Test void boundsAccept9999And10000Reject10001And99999() {
  try(ValidatorFactory f=Validation.buildDefaultValidatorFactory()) {
   PublishTaskDTO d=new PublishTaskDTO();
   for(int a:new int[]{9999,10000}) {d.setReward(a);assertTrue(f.getValidator().validateProperty(d,"reward").isEmpty());}
   for(int a:new int[]{10001,99999}) {d.setReward(a);assertFalse(f.getValidator().validateProperty(d,"reward").isEmpty());}
   d.setMaxClaimers(51);assertFalse(f.getValidator().validateProperty(d,"maxClaimers").isEmpty());d.setMaxClaimers(0);assertFalse(f.getValidator().validateProperty(d,"maxClaimers").isEmpty());
   d.setSkillSub("x".repeat(51));assertFalse(f.getValidator().validateProperty(d,"skillSub").isEmpty());d.setContact("x".repeat(201));assertFalse(f.getValidator().validateProperty(d,"contact").isEmpty());
  }
 }
 @Test void invitationBounds() {
  try(ValidatorFactory f=Validation.buildDefaultValidatorFactory()) {
   InviteTaskDTO d=new InviteTaskDTO();d.setSkills(Collections.nCopies(11,"skill"));assertFalse(f.getValidator().validate(d).isEmpty());d.setSkills(Collections.singletonList("x".repeat(21)));assertFalse(f.getValidator().validate(d).isEmpty());
  }
 }
}
